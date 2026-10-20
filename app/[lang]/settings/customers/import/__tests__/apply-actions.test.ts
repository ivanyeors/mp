import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseShopifyCustomersCsv } from "@/lib/customer-migration/shopify-csv";
import { applyPayload } from "@/lib/customer-migration/apply";
import { exportCsv, FIVE_ROWS } from "@/lib/customer-migration/__tests__/fixtures";

/**
 * The apply, finish and undo actions (slice 03): each checks
 * `customer-import`, writes only through its SQL function (the batch insert
 * apart), sends no PII back, and records one audit row per apply and per
 * undo, with counts only.
 */

const BATCH = "00000000-0000-4000-8000-0000000000b1";

const h = vi.hoisted(() => ({
  denied: null as string | null,
  calls: [] as { table?: string; method: string; args: unknown[] }[],
  rpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  insertError: null as { code?: string; message: string } | null,
  workingAs: null as { id: string; name: string } | null,
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => {
    if (h.denied) throw new Error(h.denied);
    return { userId: "u-1", email: "owner@example.com", memberId: "m-1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => h.workingAs) }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc: (name: string, args: unknown) => {
      h.calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(h.rpc[name] ?? { data: null, error: { message: "no such function" } });
    },
    from: (table: string) => {
      const chain = {
        insert: (row: unknown) => {
          h.calls.push({ table, method: "insert", args: [row] });
          return chain;
        },
        select: () => chain,
        single: () =>
          Promise.resolve(
            h.insertError
              ? { data: null, error: h.insertError }
              : { data: { id: BATCH, rows_done: 0, rows_total: 5 }, error: null },
          ),
      };
      return chain;
    },
  }),
}));

const { assertAdmin } = await import("@/lib/auth/admin");
const { recordAdminAction } = await import("@/lib/auth/audit");
const actions = await import("../actions");

const START = {
  fileName: "customers_export.csv",
  sha256: "a".repeat(64),
  rowsTotal: 5,
  withAddresses: false,
  exportedAt: "2026-10-19",
  confirmation: "IMPORT",
};
const fiveRows = () => applyPayload(parseShopifyCustomersCsv(exportCsv(FIVE_ROWS)).rows);
const FINISHED = {
  status: "applied",
  newly_applied: true,
  rows_total: 5,
  rows_done: 5,
  created: 1,
  merged: 1,
  already_imported: 1,
  skipped: { no_email: 1, invalid_email: 1 },
  skipped_total: 2,
  created_rows: 1,
  merged_rows: 1,
};
const UNDONE = { status: "undone", removed: 312, unlinked: 20, kept: 41, kept_claimed: 30, kept_referenced: 11 };

beforeEach(() => {
  vi.clearAllMocks();
  h.denied = null;
  h.calls = [];
  h.insertError = null;
  h.workingAs = { id: "p-1", name: "Ivan" };
  h.rpc = {
    import_shopify_customers: {
      data: { status: "applied", rows_done: 5, outcomes: [{ i: 0, outcome: "create" }] },
      error: null,
    },
    finish_shopify_import: { data: FINISHED, error: null },
    preview_shopify_import_undo: { data: { removed: 312, unlinked: 20, kept: 41, kept_claimed: 30, kept_referenced: 11 }, error: null },
    undo_shopify_import: { data: UNDONE, error: null },
  };
});

const EVERY_ACTION: [string, () => Promise<unknown>][] = [
  ["startShopifyImport", () => actions.startShopifyImport(START)],
  ["applyShopifyImportChunk", () => actions.applyShopifyImportChunk(BATCH, 0, fiveRows())],
  ["finishShopifyImport", () => actions.finishShopifyImport(BATCH)],
  ["previewShopifyImportUndo", () => actions.previewShopifyImportUndo(BATCH)],
  ["undoShopifyImport", () => actions.undoShopifyImport(BATCH, "UNDO")],
];

describe("every apply, resume and undo action checks customer-import", () => {
  it.each(EVERY_ACTION)("%s", async (_name, call) => {
    await call();
    expect(vi.mocked(assertAdmin).mock.calls).toEqual([["customer-import"]]);
  });

  it.each(EVERY_ACTION)("%s touches nothing for a caller without it", async (_name, call) => {
    h.denied = "Forbidden";
    await expect(call()).rejects.toThrow("Forbidden");
    expect(h.calls).toEqual([]);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("startShopifyImport", () => {
  it("records the batch with who ran it, the export date and the address choice", async () => {
    expect(await actions.startShopifyImport(START)).toEqual({ ok: true, batch: { id: BATCH, rowsDone: 0, rowsTotal: 5 } });
    expect(h.calls).toEqual([
      {
        table: "customer_import_batches",
        method: "insert",
        args: [
          {
            source: "shopify_customers_csv",
            file_name: "customers_export.csv",
            file_sha256: "a".repeat(64),
            rows_total: 5,
            with_addresses: false,
            exported_at: "2026-10-19",
            run_by_user_id: "u-1",
            run_by_profile_id: "p-1",
          },
        ],
      },
    ]);
  });

  it("refuses without a typed IMPORT, before writing", async () => {
    expect(await actions.startShopifyImport({ ...START, confirmation: "" })).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });

  it("says so when the file already has a live batch", async () => {
    h.insertError = { code: "23505", message: "duplicate key" };
    expect(await actions.startShopifyImport(START)).toEqual({
      ok: false,
      error: "This file already has an import. Reload the page to continue or review it.",
    });
  });
});

describe("applyShopifyImportChunk", () => {
  it("re-reads the chunk and makes one call, to import_shopify_customers", async () => {
    await actions.applyShopifyImportChunk(BATCH, 0, fiveRows());
    expect(h.calls).toHaveLength(1);
    const [name, args] = h.calls[0].args as [string, { p_batch_id: string; p_start_index: number; p_rows: unknown[] }];
    expect(name).toBe("import_shopify_customers");
    expect(args.p_batch_id).toBe(BATCH);
    expect(args.p_start_index).toBe(0);
    expect(args.p_rows).toEqual([
      expect.objectContaining({ i: 0, email: "ana.example@example.com", shopify_tags: ["neck", "vip"], shopify_note: "Test note" }),
      expect.objectContaining({ i: 1, email: "ben.sample@example.com" }),
      { i: 2, skip: "no_email" },
      expect.objectContaining({ i: 3, email: "dev.sample@example.com" }),
      { i: 4, skip: "invalid_email" },
    ]);
  });

  it("answers with outcomes by index, and no PII", async () => {
    const res = await actions.applyShopifyImportChunk(BATCH, 0, fiveRows());
    expect(res).toEqual({ ok: true, status: "applied", rowsDone: 5, outcomes: [{ i: 0, outcome: "create" }] });
    expect(JSON.stringify(res)).not.toMatch(/@|Ana|Ben|Example Road|\+65/);
  });

  it("passes a refusal through, so the page can resume from rows_done", async () => {
    h.rpc.import_shopify_customers = { data: { status: "refused", reason: "out_of_order", rows_done: 100 }, error: null };
    expect(await actions.applyShopifyImportChunk(BATCH, 0, fiveRows())).toEqual({
      ok: true,
      status: "refused",
      reason: "out_of_order",
      rowsDone: 100,
    });
  });

  it("refuses a bad batch id or chunk without calling the database", async () => {
    expect(await actions.applyShopifyImportChunk("nope", 0, fiveRows())).toMatchObject({ ok: false });
    expect(await actions.applyShopifyImportChunk(BATCH, 3, fiveRows())).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });
});

describe("finishShopifyImport", () => {
  it("records customer_import.apply once, with counts only", async () => {
    const res = await actions.finishShopifyImport(BATCH);
    expect(res).toMatchObject({ ok: true, status: "applied", newlyApplied: true });
    expect(h.calls.map((c) => c.args[0])).toEqual(["finish_shopify_import"]);
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(recordAdminAction).mock.calls[0][0];
    expect(entry).toEqual({
      actor: { userId: "u-1", email: "owner@example.com", memberId: "m-1" },
      action: "customer_import.apply",
      entityType: "customer_import_batch",
      entityId: BATCH,
      after: {
        rows_total: 5,
        created: 1,
        merged: 1,
        already_imported: 1,
        skipped: 2,
        skipped_by_reason: { no_email: 1, invalid_email: 1 },
      },
    });
    // The Staff member's own email is the actor; nothing about a customer, nor the file's name.
    expect(JSON.stringify(entry.after)).not.toMatch(/@|csv/);
  });

  it("records nothing when the batch was already applied, or does not reconcile", async () => {
    h.rpc.finish_shopify_import = { data: { ...FINISHED, newly_applied: false }, error: null };
    await actions.finishShopifyImport(BATCH);
    h.rpc.finish_shopify_import = { data: { ...FINISHED, status: "mismatch", newly_applied: false }, error: null };
    expect(await actions.finishShopifyImport(BATCH)).toMatchObject({ ok: true, status: "mismatch" });
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("undo", () => {
  it("previews without writing or auditing", async () => {
    expect(await actions.previewShopifyImportUndo(BATCH)).toEqual({
      ok: true,
      counts: { removed: 312, unlinked: 20, kept: 41, keptClaimed: 30, keptReferenced: 11 },
    });
    expect(h.calls.map((c) => c.args[0])).toEqual(["preview_shopify_import_undo"]);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("needs a typed UNDO, then records customer_import.undo with counts only", async () => {
    expect(await actions.undoShopifyImport(BATCH, "undo")).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);

    expect(await actions.undoShopifyImport(BATCH, "UNDO")).toMatchObject({ ok: true, counts: { removed: 312, kept: 41 } });
    expect(h.calls.map((c) => c.args[0])).toEqual(["undo_shopify_import"]);
    expect(vi.mocked(recordAdminAction).mock.calls).toEqual([
      [
        {
          actor: { userId: "u-1", email: "owner@example.com", memberId: "m-1" },
          action: "customer_import.undo",
          entityType: "customer_import_batch",
          entityId: BATCH,
          after: { removed: 312, unlinked: 20, kept: 41, kept_claimed: 30, kept_referenced: 11 },
        },
      ],
    ]);
  });

  it("records nothing for a batch that was already undone", async () => {
    h.rpc.undo_shopify_import = { data: { ...UNDONE, status: "already_undone" }, error: null };
    await actions.undoShopifyImport(BATCH, "UNDO");
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
