import { describe, expect, it, vi } from "vitest";
import {
  normaliseRows,
  planCustomerRow,
  planRows,
  type ExistingCustomer,
  type ExistingLookup,
  type PlanOutcome,
  type SkipReason,
} from "@/lib/customer-migration/plan";
import { jsonBytes, readPreviewChunk, runShopifyPreview } from "@/lib/customer-migration/preview";
import { parseShopifyCustomersCsv } from "@/lib/customer-migration/shopify-csv";
import {
  APPLY_CHUNK_ROWS,
  applyPayload,
  importRows,
  localIsoDate,
  readApplyChunk,
  readFinishResult,
  readImportResult,
  readStartInput,
  reconcile,
  runShopifyImport,
  type ApplyChunkFn,
  type ApplyChunkResponse,
  type ApplyRawRow,
  type FinishFn,
  type ImportRow,
  type RowOutcome,
} from "@/lib/customer-migration/apply";
import {
  batchForFile,
  batchMismatch,
  batchState,
  toBatchView,
  type ImportBatchRow,
  type ImportBatchView,
} from "@/lib/customer-migration/batches";
import { AGREEMENT_EXPORT, buyer, exportCsv, FIVE_ROWS } from "./fixtures";

type Customer = ExistingCustomer & { email: string };

function fakeDatabase() {
  const customers = new Map<string, Customer>();
  const migratedIds = new Set<string>();
  let next = 1;
  type Batch = {
    rowsTotal: number;
    rowsDone: number;
    created: number;
    merged: number;
    alreadyImported: number;
    skipped: Partial<Record<SkipReason, number>>;
    applied: boolean;
  };
  const batches = new Map<string, Batch>();
  const written = new Map<string, number[]>();

  const lookup = (): ExistingLookup => ({ customersByEmail: customers, migratedShopifyIds: migratedIds });

  const addCustomer = (email: string, over: Partial<Customer> = {}) => {
    const c: Customer = {
      customer_id: `c-${next++}`,
      email,
      has_account: false,
      has_first_name: false,
      has_last_name: false,
      has_phone: false,
      has_address: false,
      migrated: null,
      ...over,
    };
    customers.set(email, c);
    return c;
  };

  const start = (rowsTotal: number) => {
    const id = `00000000-0000-4000-8000-${String(batches.size + 1).padStart(12, "0")}`;
    batches.set(id, { rowsTotal, rowsDone: 0, created: 0, merged: 0, alreadyImported: 0, skipped: {}, applied: false });
    written.set(id, []);
    return { id, rowsDone: 0, rowsTotal };
  };

  const importChunk = (batchId: string, startIndex: number, rows: ImportRow[]): ApplyChunkResponse => {
    const b = batches.get(batchId)!;
    if (b.applied) return { ok: true, status: "refused", reason: "applied", rowsDone: b.rowsDone };
    if (startIndex !== b.rowsDone) return { ok: true, status: "refused", reason: "out_of_order", rowsDone: b.rowsDone };
    if (b.rowsDone + rows.length > b.rowsTotal) return { ok: true, status: "refused", reason: "past_end", rowsDone: b.rowsDone };
    const outcomes: RowOutcome[] = rows.map((row) => {
      if ("skip" in row) {
        b.skipped[row.skip] = (b.skipped[row.skip] ?? 0) + 1;
        return { i: row.i, outcome: "skip", reason: row.skip };
      }
      const plan = planCustomerRow(row, lookup());
      if (plan.outcome === "skip") {
        b.skipped[plan.reason] = (b.skipped[plan.reason] ?? 0) + 1;
        return { i: row.i, outcome: "skip", reason: plan.reason };
      }
      if (plan.outcome === "already_imported") {
        b.alreadyImported++;
        return { i: row.i, outcome: plan.outcome };
      }
      const customer = customers.get(row.email) ?? addCustomer(row.email);
      customer.migrated = { shopify_customer_id: row.shopify_customer_id };
      if (row.shopify_customer_id) migratedIds.add(row.shopify_customer_id);
      written.get(batchId)!.push(row.i);
      if (plan.outcome === "create") b.created++;
      else b.merged++;
      return { i: row.i, outcome: plan.outcome };
    });
    b.rowsDone += rows.length;
    return { ok: true, status: "applied", rowsDone: b.rowsDone, outcomes };
  };

  const applyChunk = vi.fn<ApplyChunkFn>(async (batchId, startIndex, rows) => {
    const read = readApplyChunk(JSON.parse(JSON.stringify(rows)), startIndex);
    if (!read.ok) return read;
    return importChunk(batchId, read.startIndex, importRows(read.rows));
  });

  const finish = vi.fn<FinishFn>(async (batchId) => {
    const b = batches.get(batchId)!;
    const counts = { ...b };
    const r = reconcile(counts);
    const status = !r.complete ? "incomplete" : r.reconciles ? "applied" : "mismatch";
    const newlyApplied = status === "applied" && !b.applied;
    if (status === "applied") b.applied = true;
    return { ok: true, status, counts, rows: { created: b.created, merged: b.merged }, newlyApplied };
  });

  const preview = async (text: string) => {
    const run = await runShopifyPreview(text, async (chunk) => {
      const read = readPreviewChunk(JSON.parse(JSON.stringify(chunk)));
      if (!read.ok) return read;
      return { ok: true, results: planRows(normaliseRows(read.rows), lookup()) };
    });
    if (run.kind !== "done") throw new Error(run.kind);
    return run;
  };

  return { customers, batches, written, addCustomer, start, applyChunk, finish, preview };
}

const imported = async (db: ReturnType<typeof fakeDatabase>, text: string, batch = db.start(parseShopifyCustomersCsv(text).rows.length)) => {
  const run = await runShopifyImport({ text, batch, applyChunk: db.applyChunk, finish: db.finish });
  if (run.kind !== "finished") throw new Error(`stopped: ${run.error}`);
  return run.result;
};

const outcomeCounts = (outcomes: Record<PlanOutcome, number>) => ({
  created: outcomes.create,
  merged: outcomes.merge,
  alreadyImported: outcomes.already_imported,
});

describe("runShopifyImport: the import does what the preview said", () => {
  it("a fixture on a fresh database: the exact previewed counts, then 0 created and 0 merged", async () => {
    const db = fakeDatabase();
    const text = exportCsv(AGREEMENT_EXPORT);
    const { summary } = await db.preview(text);
    const first = await imported(db, text);
    expect(first.status).toBe("applied");
    expect(first.counts).toMatchObject(outcomeCounts(summary.outcomes));
    expect(first.counts.skipped).toEqual(summary.skipReasons);
    expect(reconcile(first.counts)).toEqual({ complete: true, accounted: 18, reconciles: true });

    const again = await imported(db, `${text}\n`);
    expect(again.counts).toMatchObject({ created: 0, merged: 0, alreadyImported: first.counts.created + first.counts.merged });
  });

  it("a row whose email gains a Customer between the preview and the apply merges", async () => {
    const db = fakeDatabase();
    const text = exportCsv([buyer(1), buyer(2)]);
    expect((await db.preview(text)).summary.outcomes).toMatchObject({ create: 2, merge: 0 });
    db.addCustomer("buyer2@example.com", { has_account: true });
    const result = await imported(db, text);
    expect(result.counts).toMatchObject({ created: 1, merged: 1 });
    expect([...db.customers.keys()].filter((e) => e === "buyer2@example.com")).toHaveLength(1);
  });

  it("carries file-wide duplicates into the write path, even across chunks", async () => {
    const db = fakeDatabase();
    const rows = Array.from({ length: 150 }, (_, n) => buyer(n));
    rows[149] = buyer(149, { Email: "BUYER0@example.com" });
    const result = await imported(db, exportCsv(rows));
    expect(result.counts.skipped).toEqual({ duplicate_email_in_file: 2 });
    expect(db.customers.has("buyer0@example.com")).toBe(false);
  });
});

describe("runShopifyImport: chunks", () => {
  it("sends 5,000 rows in file order, at most 100 rows and well under 1 MB a call", async () => {
    const db = fakeDatabase();
    const rows = Array.from({ length: 5000 }, (_, n) => buyer(n, { Note: "A note ".repeat(20), Tags: "a, b, c" }));
    await imported(db, exportCsv(rows));
    const calls = db.applyChunk.mock.calls;
    expect(calls).toHaveLength(50);
    let expectStart = 0;
    for (const [, start, chunk] of calls) {
      expect(start).toBe(expectStart);
      expect(chunk.map((r) => r.i)).toEqual(Array.from({ length: chunk.length }, (_, k) => start + k));
      expect(chunk.length).toBeLessThanOrEqual(APPLY_CHUNK_ROWS);
      expect(jsonBytes(chunk)).toBeLessThan(1024 * 1024);
      expectStart += chunk.length;
    }
  });
});

describe("runShopifyImport: closing the tab, and resuming", () => {
  it("picking the same file continues from rows_done, and the finished batch reconciles", async () => {
    const db = fakeDatabase();
    const text = exportCsv(Array.from({ length: 450 }, (_, n) => buyer(n)));
    const batch = db.start(450);
    let calls = 0;
    const closing: ApplyChunkFn = async (...args) => {
      if (++calls === 3) throw new Error("Failed to fetch");
      return db.applyChunk(...args);
    };
    const stopped = await runShopifyImport({ text, batch, applyChunk: closing, finish: db.finish });
    expect(stopped).toEqual({ kind: "stopped", rowsDone: 200, error: "Failed to fetch" });
    expect(db.finish).not.toHaveBeenCalled();

    db.applyChunk.mockClear();
    const resumed = await runShopifyImport({
      text,
      batch: { id: batch.id, rowsDone: db.batches.get(batch.id)!.rowsDone, rowsTotal: 450 },
      applyChunk: db.applyChunk,
      finish: db.finish,
    });
    expect(db.applyChunk.mock.calls.map(([, start]) => start)).toEqual([200, 300, 400]);
    expect(resumed).toMatchObject({ kind: "finished", result: { status: "applied", counts: { created: 450 } } });
    expect(db.written.get(batch.id)).toEqual(Array.from({ length: 450 }, (_, i) => i));
  });

  it("a chunk that landed but whose answer was lost is refused when sent again, not counted twice", async () => {
    const db = fakeDatabase();
    const text = exportCsv(Array.from({ length: 250 }, (_, n) => buyer(n)));
    const batch = db.start(250);
    let calls = 0;
    const lossy: ApplyChunkFn = async (...args) => {
      const res = await db.applyChunk(...args);
      if (++calls === 2) throw new Error("network dropped the answer");
      return res;
    };
    const stopped = await runShopifyImport({ text, batch, applyChunk: lossy, finish: db.finish });
    expect(stopped).toMatchObject({ kind: "stopped", rowsDone: 100 });
    expect(db.batches.get(batch.id)!.rowsDone).toBe(200);

    db.applyChunk.mockClear();
    const resumed = await runShopifyImport({
      text,
      batch: { id: batch.id, rowsDone: 100, rowsTotal: 250 },
      applyChunk: db.applyChunk,
      finish: db.finish,
    });
    const answers = await Promise.all(db.applyChunk.mock.results.map((r) => r.value));
    expect(answers[0]).toEqual({ ok: true, status: "refused", reason: "out_of_order", rowsDone: 200 });
    expect(db.applyChunk.mock.calls.map(([, start]) => start)).toEqual([100, 200]);
    expect(resumed).toMatchObject({ kind: "finished", result: { status: "applied", counts: { created: 250 } } });
    expect(db.written.get(batch.id)).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });

  it("stops on any other refusal, and on a file that is not the batch's", async () => {
    const db = fakeDatabase();
    const text = exportCsv([buyer(1)]);
    const done = await imported(db, text);
    expect(done.status).toBe("applied");
    const batch = { id: [...db.batches.keys()][0], rowsDone: 0, rowsTotal: 1 };
    expect(await runShopifyImport({ text, batch, applyChunk: db.applyChunk, finish: db.finish })).toMatchObject({
      kind: "stopped",
      error: "This import has already finished.",
    });
    expect(
      await runShopifyImport({ text, batch: { ...batch, rowsTotal: 2 }, applyChunk: db.applyChunk, finish: db.finish }),
    ).toMatchObject({ kind: "stopped", error: "This file does not match the import it would continue." });
  });

  it("reports a batch that does not reconcile as such, never as applied", async () => {
    const db = fakeDatabase();
    const text = exportCsv([buyer(1), buyer(2)]);
    const finish: FinishFn = async (id) => {
      const res = await db.finish(id);
      if (!res.ok) return res;
      return { ...res, status: "mismatch", counts: { ...res.counts, merged: 1 }, newlyApplied: false };
    };
    const run = await runShopifyImport({ text, batch: db.start(2), applyChunk: db.applyChunk, finish });
    expect(run).toMatchObject({ kind: "finished", result: { status: "mismatch" } });
  });
});

describe("applyPayload", () => {
  it("sends every column the import reads, Tags and Note included, and marks file-wide duplicates with no cells", () => {
    const { rows } = parseShopifyCustomersCsv(exportCsv([...FIVE_ROWS, buyer(9, { Email: "ana.example@example.com" })]));
    const payload = applyPayload(rows);
    expect(payload[0]).toEqual({ i: 0, raw: {}, skip: "duplicate_email_in_file" });
    expect(payload[5]).toEqual({ i: 5, raw: {}, skip: "duplicate_email_in_file" });
    expect(payload[1].raw).toMatchObject({ email: "ben.sample@example.com", totalOrders: "0" });
    const { rows: tagged } = parseShopifyCustomersCsv(exportCsv([buyer(1, { Tags: "vip", Note: "n" })]));
    expect(applyPayload(tagged)[0].raw).toMatchObject({ tags: "vip", note: "n" });
    expect(JSON.stringify(applyPayload(tagged))).not.toMatch(/acceptsSms|taxExempt|Accepts SMS/);
  });
});

describe("readApplyChunk: the server's check", () => {
  const row = (i: number, raw: object = { email: `r${i}@example.com` }) => ({ i, raw });

  it("accepts rows in file order from the start index, and drops cells it does not read", () => {
    const res = readApplyChunk([row(5, { email: "a@example.com", extra: "x", note: "kept" }), row(6)], 5);
    expect(res).toEqual({
      ok: true,
      startIndex: 5,
      rows: [
        { i: 5, raw: { email: "a@example.com", note: "kept" } },
        { i: 6, raw: { email: "r6@example.com" } },
      ],
    });
  });

  it("refuses rows out of order, a gap, too many rows, an unknown skip and a bad start", () => {
    expect(readApplyChunk([row(1), row(0)], 0)).toMatchObject({ ok: false });
    expect(readApplyChunk([row(0), row(2)], 0)).toMatchObject({ ok: false });
    expect(readApplyChunk([row(1)], 0)).toMatchObject({ ok: false });
    expect(readApplyChunk(Array.from({ length: 101 }, (_, i) => row(i)), 0)).toMatchObject({ ok: false });
    expect(readApplyChunk([{ i: 0, raw: {}, skip: "email_already_migrated" }], 0)).toMatchObject({ ok: false });
    expect(readApplyChunk([row(0)], -1)).toMatchObject({ ok: false });
    expect(readApplyChunk([row(0)], 0.5)).toMatchObject({ ok: false });
    expect(readApplyChunk([], 0)).toMatchObject({ ok: false });
  });

  it("keeps a browser skip only for a file-wide duplicate, and drops its cells", () => {
    expect(readApplyChunk([{ i: 0, raw: { email: "x@example.com" }, skip: "duplicate_customer_id_in_file" }], 0)).toEqual({
      ok: true,
      startIndex: 0,
      rows: [{ i: 0, raw: {}, skip: "duplicate_customer_id_in_file" }],
    });
  });
});

describe("importRows: what the server hands the SQL function", () => {
  it("normalises every row itself, skips the unusable, and finds duplicates within the chunk again", () => {
    const chunk: ApplyRawRow[] = [
      { i: 0, raw: { email: " Ana@Example.com ", totalOrders: "2", totalSpent: "10", tags: "a, b", note: "n" } },
      { i: 1, raw: { email: "" } },
      { i: 2, raw: { email: "dup@example.com" } },
      { i: 3, raw: { email: "DUP@example.com" } },
      { i: 4, raw: {}, skip: "duplicate_email_in_file" },
    ];
    const rows = importRows(chunk);
    expect(rows[0]).toMatchObject({
      i: 0,
      email: "ana@example.com",
      shopify_orders_count: 2,
      shopify_tags: ["a", "b"],
      shopify_note: "n",
    });
    expect(rows.slice(1)).toEqual([
      { i: 1, skip: "no_email" },
      { i: 2, skip: "duplicate_email_in_file" },
      { i: 3, skip: "duplicate_email_in_file" },
      { i: 4, skip: "duplicate_email_in_file" },
    ]);
  });
});

describe("readStartInput: a new batch", () => {
  const good = {
    fileName: "  customers_export.csv ",
    sha256: "a".repeat(64),
    rowsTotal: 3400,
    withAddresses: true,
    exportedAt: "2026-10-19",
    confirmation: "IMPORT",
  };

  it("accepts a typed IMPORT and the export date", () => {
    expect(readStartInput(good, "2026-10-20")).toEqual({
      ok: true,
      row: {
        file_name: "customers_export.csv",
        file_sha256: "a".repeat(64),
        rows_total: 3400,
        with_addresses: true,
        exported_at: "2026-10-19",
      },
    });
    expect(readStartInput({ ...good, exportedAt: "2026-10-21" }, "2026-10-20").ok).toBe(true);
  });

  it.each([
    ["no confirmation", { confirmation: "import" }],
    ["no fingerprint", { sha256: "xyz" }],
    ["no rows", { rowsTotal: 0 }],
    ["no address choice", { withAddresses: "yes" }],
    ["no date", { exportedAt: "" }],
    ["an impossible date", { exportedAt: "2026-02-30" }],
    ["a future date", { exportedAt: "2026-10-22" }],
    ["a date before the shop", { exportedAt: "2014-12-31" }],
  ])("refuses %s", (_label, over) => {
    expect(readStartInput({ ...good, ...over }, "2026-10-20")).toMatchObject({ ok: false });
  });

  it("starts the date field at the file's own date, in the browser's time zone", () => {
    expect(localIsoDate(new Date(2026, 9, 19, 23, 59).getTime())).toBe("2026-10-19");
  });
});

describe("reading the database's answers", () => {
  it("reads an applied chunk, a refusal and nonsense", () => {
    expect(readImportResult({ status: "applied", rows_done: 100, outcomes: [{ i: 0, outcome: "create" }] })).toEqual({
      ok: true,
      status: "applied",
      rowsDone: 100,
      outcomes: [{ i: 0, outcome: "create" }],
    });
    expect(readImportResult({ status: "refused", reason: "out_of_order", rows_done: 200 })).toEqual({
      ok: true,
      status: "refused",
      reason: "out_of_order",
      rowsDone: 200,
    });
    expect(readImportResult(null)).toMatchObject({ ok: false });
  });

  it("reads finish_shopify_import", () => {
    expect(
      readFinishResult({
        status: "applied",
        newly_applied: true,
        rows_total: 4,
        rows_done: 4,
        created: 1,
        merged: 1,
        already_imported: 1,
        skipped: { no_email: 1 },
        created_rows: 1,
        merged_rows: 1,
      }),
    ).toEqual({
      ok: true,
      status: "applied",
      newlyApplied: true,
      counts: { rowsTotal: 4, rowsDone: 4, created: 1, merged: 1, alreadyImported: 1, skipped: { no_email: 1 } },
      rows: { created: 1, merged: 1 },
    });
    expect(readFinishResult({ status: "nope" })).toMatchObject({ ok: false });
  });

  it("reconciles only a complete batch whose rows are all accounted for", () => {
    const counts = { rowsTotal: 10, rowsDone: 10, created: 4, merged: 3, alreadyImported: 1, skipped: { no_email: 2 } };
    expect(reconcile(counts)).toEqual({ complete: true, accounted: 10, reconciles: true });
    expect(reconcile({ ...counts, merged: 2 })).toEqual({ complete: true, accounted: 9, reconciles: false });
    expect(reconcile({ ...counts, rowsDone: 8 })).toMatchObject({ complete: false, reconciles: false });
  });
});

describe("Import history", () => {
  const row: ImportBatchRow = {
    id: "b1",
    file_name: "customers_export.csv",
    file_sha256: "a".repeat(64),
    rows_total: 3400,
    rows_done: 1200,
    with_addresses: true,
    exported_at: "2026-10-19",
    created: 1000,
    merged: 100,
    already_imported: 50,
    skipped: { no_email: 50 },
    run_by_user_id: "u1",
    run_by_profile_id: "p1",
    created_at: "2026-10-20T01:00:00Z",
    applied_at: null,
    rolled_back_at: null,
    undo_counts: null,
  };
  const names = { profiles: new Map([["p1", "Ivan"]]), members: new Map([["u1", "studio@example.com"]]) };
  const view = (over: Partial<ImportBatchRow> = {}): ImportBatchView => toBatchView({ ...row, ...over }, names);

  it("names who ran it: the Staff profile, else the Member's login", () => {
    expect(view().runBy).toBe("Ivan");
    expect(view({ run_by_profile_id: null }).runBy).toBe("studio@example.com");
    expect(view({ run_by_profile_id: null, run_by_user_id: null }).runBy).toBeNull();
  });

  it("tells applied, stopped and undone apart", () => {
    expect(batchState(view())).toBe("stopped");
    expect(batchState(view({ applied_at: "2026-10-20T02:00:00Z" }))).toBe("applied");
    expect(batchState(view({ applied_at: "2026-10-20T02:00:00Z", rolled_back_at: "2026-10-21T00:00:00Z" }))).toBe("undone");
  });

  it("finds a picked file's batch by SHA-256, and an undone batch frees the file", () => {
    const stopped = view();
    expect(batchForFile([stopped], "a".repeat(64))).toBe(stopped);
    expect(batchForFile([stopped], "b".repeat(64))).toBeNull();
    expect(batchForFile([view({ rolled_back_at: "2026-10-21T00:00:00Z" })], "a".repeat(64))).toBeNull();
  });

  it("flags a stopped batch with every row whose counts do not reconcile", () => {
    expect(batchMismatch(view())).toBeNull();
    expect(batchMismatch(view({ rows_done: 3400, created: 3200, merged: 100, already_imported: 50, skipped: { no_email: 50 } }))).toBeNull();
    expect(batchMismatch(view({ rows_done: 3400 }))).toMatchObject({ accounted: 1200, reconciles: false });
  });
});
