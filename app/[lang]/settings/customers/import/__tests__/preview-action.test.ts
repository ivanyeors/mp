import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedRawRow, PreviewMatchRow } from "@/lib/customer-migration/plan";
import { parseShopifyCustomersCsv } from "@/lib/customer-migration/shopify-csv";
import { previewPayload } from "@/lib/customer-migration/preview";
import { exportCsv, FIVE_ROWS, FIVE_ROWS_MATCHES } from "@/lib/customer-migration/__tests__/fixtures";

/**
 * The preview action (slice 02): guarded by `customer-import` on every chunk,
 * reads through one SQL function, writes nothing, and answers without PII.
 */

const h = vi.hoisted(() => ({
  denied: null as string | null,
  /** Every call made on the Supabase client, by method name. */
  calls: [] as { method: string; args: unknown[] }[],
  matches: [] as unknown[],
  rpcError: null as { message: string } | null,
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => {
    if (h.denied) throw new Error(h.denied);
    return { userId: "u-1", email: "owner@example.com", memberId: "m-1" };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (...args: unknown[]) => {
          h.calls.push({ method, args });
          if (method === "rpc") return Promise.resolve({ data: h.matches, error: h.rpcError });
          throw new Error(`unexpected Supabase call: ${method}`);
        },
      },
    ),
}));

const { assertAdmin } = await import("@/lib/auth/admin");
const { previewShopifyImport } = await import("../actions");

const fiveRows = (): IndexedRawRow[] => previewPayload(parseShopifyCustomersCsv(exportCsv(FIVE_ROWS)).rows);

beforeEach(() => {
  vi.clearAllMocks();
  h.denied = null;
  h.calls = [];
  h.matches = FIVE_ROWS_MATCHES;
  h.rpcError = null;
});

describe("previewShopifyImport", () => {
  it("checks customer-import, not customers, on every chunk", async () => {
    await previewShopifyImport(fiveRows());
    await previewShopifyImport(fiveRows());
    expect(assertAdmin).toHaveBeenCalledTimes(2);
    expect(vi.mocked(assertAdmin).mock.calls.every(([key]) => key === "customer-import")).toBe(true);
  });

  it("reads nothing for a caller without customer-import", async () => {
    h.denied = "Forbidden";
    await expect(previewShopifyImport(fiveRows())).rejects.toThrow("Forbidden");
    expect(h.calls).toEqual([]);
  });

  it("makes one read through customer_import_preview_matches and nothing else", async () => {
    await previewShopifyImport(fiveRows());
    expect(h.calls.map((c) => c.method)).toEqual(["rpc"]);
    expect(h.calls[0].args[0]).toBe("customer_import_preview_matches");
  });

  it("re-reads every raw cell itself: the lookup gets cleaned, lowercased keys", async () => {
    await previewShopifyImport(fiveRows());
    expect(h.calls[0].args[1]).toEqual({
      p_emails: ["ana.example@example.com", "ben.sample@example.com", "dev.sample@example.com"],
      p_shopify_ids: ["7000000000001", "7000000000002", "7000000000004"],
    });
  });

  it("answers each row by index with its outcome and repairs, and no PII", async () => {
    const res = await previewShopifyImport(fiveRows());
    expect(res).toEqual({
      ok: true,
      results: [
        { i: 0, outcome: "create", repairs: ["zip_repaired"] },
        { i: 1, outcome: "merge", repairs: [] },
        { i: 2, outcome: "skip", reason: "no_email", repairs: [] },
        { i: 3, outcome: "already_imported", repairs: [] },
        { i: 4, outcome: "skip", reason: "invalid_email", repairs: [] },
      ],
    });
    expect(JSON.stringify(res)).not.toMatch(/@|Ana|Ben|Test|Example Road|\+65/);
  });

  it("drops cells the preview never reads, even when a request carries them", async () => {
    const rows = [{ i: 0, raw: { email: "a@example.com", note: "health remark", acceptsSmsMarketing: "yes" } }];
    h.matches = [];
    const res = await previewShopifyImport(rows as IndexedRawRow[]);
    expect(res).toEqual({ ok: true, results: [{ i: 0, outcome: "create", repairs: ["total_orders_invalid", "total_spent_invalid"] }] });
    expect(JSON.stringify(h.calls)).not.toContain("health remark");
  });

  it("refuses more than 250 rows without reading", async () => {
    const rows = Array.from({ length: 251 }, (_, i) => ({ i, raw: { email: `r${i}@example.com` } }));
    expect(await previewShopifyImport(rows)).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });

  it("does not read at all when no row can be imported", async () => {
    const res = await previewShopifyImport([{ i: 0, raw: { phone: "+6591234567" } }]);
    expect(res).toEqual({ ok: true, results: [{ i: 0, outcome: "skip", reason: "no_email", repairs: [] }] });
    expect(h.calls).toEqual([]);
  });

  it("reports a failed read", async () => {
    h.rpcError = { message: "boom" };
    expect(await previewShopifyImport(fiveRows())).toEqual({
      ok: false,
      error: "Could not read existing customers: boom",
    });
  });
});

describe("the preview writes nothing, and the import writes only through its SQL functions", () => {
  const ROOT = process.cwd();
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
  const libDir = join("lib", "customer-migration");
  const ACTIONS = "app/[lang]/settings/customers/import/actions.ts";
  const readOnly = [
    "app/[lang]/settings/customers/import/import-client.tsx",
    "app/[lang]/settings/customers/import/page.tsx",
    "app/[lang]/settings/customers/import/history.ts",
    ...readdirSync(join(ROOT, libDir))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(libDir, f)),
  ];

  /** Not to Storage, not to Media, not to Drive, not to disk, not to another server, and no auth user. */
  const neverStored = (src: string) => {
    expect(src).not.toMatch(/auth\.admin/);
    expect(src).not.toMatch(/\.storage\b|@\/lib\/(media|media-assets|google)\b/);
    expect(src).not.toMatch(/from ["'](node:)?fs["']|writeFile/);
    expect(src).not.toMatch(/\bfetch\(/);
  };

  it.each(readOnly)("%s has no insert, update, delete, upload, file write or auth admin call", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    neverStored(src);
  });

  it("the actions insert the Import batch and nothing else; every other write is a SQL function", () => {
    const src = read(ACTIONS);
    neverStored(src);
    expect(src.match(/\.(insert|update|upsert|delete)\(/g)).toEqual([".insert("]);
    expect(src).toMatch(/\.from\("customer_import_batches"\)\s*\.insert\(/);
    expect([...src.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual([
      "customer_import_preview_matches",
      "finish_shopify_import",
      "import_shopify_customers",
      "preview_shopify_import_undo",
      // Preview and run of Subscribe imported customers (ADR 0039).
      "subscribe_migrated_customers",
      "subscribe_migrated_customers",
      "undo_shopify_import",
    ]);
    // The preview's own body reads only.
    const preview = src.slice(src.indexOf("export async function previewShopifyImport"), src.indexOf("const UUID"));
    expect(preview).not.toMatch(/\.(insert|update|upsert|delete)\(|\.from\(/);
  });

  it("customer_import_preview_matches only reads, and only the service role may run it", () => {
    const sql = read("supabase/migrations/20261020100000_customer_import.sql");
    const fn = sql.slice(sql.indexOf("create or replace function public.customer_import_preview_matches"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/\bstable\b/);
    expect(body).toMatch(/security invoker/);
    expect(body).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(sql).toMatch(
      /revoke execute on function public\.customer_import_preview_matches\(text\[\], text\[\]\) from public, anon, authenticated;/,
    );
  });

  it("the match rows the action reads have the fixture's shape", () => {
    const row: PreviewMatchRow = FIVE_ROWS_MATCHES[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "match", "key", "customer_id", "has_account", "has_first_name", "has_last_name",
        "has_phone", "has_address", "migrated", "migrated_shopify_customer_id",
      ].sort(),
    );
  });
});
