import { describe, expect, it } from "vitest";
import { parseFittingFormCsv, type DateOrder } from "@/lib/fitting-import/google-form-csv";
import {
  existingFromMatches,
  NO_EXISTING,
  normaliseRows,
  planFittingRow,
  planRows,
  type ExistingLookup,
  type IndexedRawRow,
  type RowPreview,
} from "@/lib/fitting-import/plan";
import { readPreviewChunk, runFittingPreview, skippedRowsCsv, type PreviewChunkResponse } from "@/lib/fitting-import/preview";
import {
  applyPayload,
  importRows,
  readApplyChunk,
  readStartInput,
  reconcile,
  runFittingImport,
  type ApplyChunkResponse,
  type ApplyRawRow,
} from "@/lib/fitting-import/apply";
import { batchForFile, batchMismatch, toBatchView, type FittingBatchRow } from "@/lib/fitting-import/batches";
import { formCsv } from "./fixtures";

const NOW = Date.parse("2026-10-31T08:00:00Z");

/** Five rows: a new email, the same new email again later, a mobile only, a duplicate, an unreachable row. */
const FILE = formCsv([
  { "Email:": "new@example.com", Timestamp: "10/1/2026 10:00:00" },
  { "Email:": "", "Mobile No: ": "8123 0002", Timestamp: "10/2/2026 10:00:00" },
  { "Email:": "new@example.com", Timestamp: "10/20/2026 10:00:00" },
  { "Email:": "new@example.com", Timestamp: "10/1/2026 10:00:00" },
  { "Email:": "", "Mobile No: ": "", Timestamp: "10/3/2026 10:00:00" },
]);

const rowsOf = (text: string) => parseFittingFormCsv(text).rows;

describe("planFittingRow", () => {
  const existing: ExistingLookup = existingFromMatches([
    { match: "email", key: "mei@example.com", customer_id: "c-mei" },
    { match: "phone", key: "+6591230001", customer_id: "c-ali" },
    { match: "phone", key: "+6588880000", customer_id: "c-twin-1" },
    { match: "phone", key: "+6588880000", customer_id: "c-twin-2" },
    { match: "key", key: "k-done", customer_id: "c-mei" },
  ]);

  it("follows the SQL function's rules in order", () => {
    expect(planFittingRow({ key: "k-done", email: "x@example.com", phone: null }, existing)).toEqual({ outcome: "already_imported" });
    expect(planFittingRow({ key: "k", email: "mei@example.com", phone: "+6591230001" }, existing)).toEqual({
      outcome: "matched_email",
      customer_id: "c-mei",
    });
    expect(planFittingRow({ key: "k", email: "new@example.com", phone: "+6591230001" }, existing)).toEqual({ outcome: "created" });
    expect(planFittingRow({ key: "k", email: null, phone: "+6591230001" }, existing)).toEqual({
      outcome: "matched_phone",
      customer_id: "c-ali",
    });
    expect(planFittingRow({ key: "k", email: null, phone: "+6588880000" }, existing)).toEqual({
      outcome: "skip",
      reason: "mobile_matches_several",
    });
    expect(planFittingRow({ key: "k", email: null, phone: "+6590000000" }, existing)).toEqual({
      outcome: "skip",
      reason: "no_customer_for_mobile",
    });
  });
});

describe("the preview", () => {
  /** A stand-in for the server action: the real reader and planner, against `existing`. */
  const server =
    (existing: ExistingLookup = NO_EXISTING, seen: IndexedRawRow[][] = []) =>
    async (rows: IndexedRawRow[], order: DateOrder): Promise<PreviewChunkResponse> => {
      seen.push(rows);
      const chunk = readPreviewChunk(rows, order);
      if (!chunk.ok) return chunk;
      return { ok: true, results: planRows(normaliseRows(chunk.rows, chunk.order, NOW), existing) };
    };

  it("sends only the timestamp, email and mobile, and settles the file as a whole", async () => {
    const seen: IndexedRawRow[][] = [];
    const run = await runFittingPreview(FILE, server(existingFromMatches([{ match: "phone", key: "+6581230002", customer_id: "c" }]), seen));
    expect(run.kind).toBe("done");
    if (run.kind !== "done") return;
    for (const row of seen.flat()) {
      expect(Object.keys(row.raw.cells).every((k) => ["timestamp", "email", "mobile"].includes(k))).toBe(true);
      expect(row.raw.other).toEqual({});
    }
    expect(run.order).toBe("mdy");
    expect(run.previews).toEqual<RowPreview[]>([
      { i: 0, outcome: "created" },
      { i: 1, outcome: "matched_phone" },
      // The email row 0 creates is a match by the time row 2 is written.
      { i: 2, outcome: "matched_email" },
      { i: 3, outcome: "skip", reason: "duplicate_in_file" },
      { i: 4, outcome: "skip", reason: "no_contact" },
    ]);
    expect(run.summary.outcomes).toEqual({ created: 1, matched_email: 1, matched_phone: 1, already_imported: 0, skip: 2 });
    expect(run.summary.withPhotos).toBe(3);
    expect(run.skipped.map((s) => [s.row, s.reason])).toEqual([
      [3, "duplicate_in_file"],
      [4, "no_contact"],
    ]);
    expect(skippedRowsCsv(run.skipped).split("\r\n")[0]).toBe("Row,Timestamp,Name,Email,Mobile,Reason");
  });

  it("stops on a header it cannot import, and on dates in both orders, before calling the server", async () => {
    const seen: IndexedRawRow[][] = [];
    expect((await runFittingPreview("Name,Email\nA,a@example.com", server(NO_EXISTING, seen))).kind).toBe("header_error");
    const mixed = formCsv([{ Timestamp: "10/17/2026 10:00:00" }, { Timestamp: "17/10/2026 10:00:00" }]);
    expect((await runFittingPreview(mixed, server(NO_EXISTING, seen))).kind).toBe("dates_conflict");
    expect(seen).toEqual([]);
  });

  it("uses Staff's date order only when the file's dates fit both", async () => {
    const ambiguous = formCsv([{ Timestamp: "3/4/2026 10:00:00" }]);
    const run = await runFittingPreview(ambiguous, server(), { order: "dmy" });
    expect(run.kind === "done" && run.order).toBe("dmy");
    const proven = await runFittingPreview(FILE, server(), { order: "dmy" });
    expect(proven.kind === "done" && proven.order).toBe("mdy");
  });

  it("drops anything but the three cells on the server", () => {
    const chunk = readPreviewChunk(
      [{ i: 0, raw: { cells: { timestamp: "10/1/2026", notes: "secret", bogus: "x" }, other: { Extra: "y" } } }],
      "mdy",
    );
    expect(chunk).toEqual({ ok: true, order: "mdy", rows: [{ i: 0, raw: { cells: { timestamp: "10/1/2026" }, other: {} } }] });
    expect(readPreviewChunk([{ i: 0, raw: { cells: {} } }], "ymd")).toEqual({ ok: false, error: "Choose how the file writes its dates." });
  });
});

describe("the import", () => {
  it("marks duplicates in the payload, and the server re-reads every row itself", () => {
    const payload = applyPayload(rowsOf(FILE), "mdy");
    expect(payload[3]).toEqual({ i: 3, raw: { cells: {}, other: {} }, skip: "duplicate_in_file" });

    const chunk = readApplyChunk(payload, 0);
    expect(chunk.ok).toBe(true);
    if (!chunk.ok) return;
    const rows = importRows(chunk.rows, "mdy", NOW);
    expect(rows.map((r) => ("skip" in r ? r.skip : r.email ?? r.phone))).toEqual([
      "new@example.com",
      "+6581230002",
      "new@example.com",
      "duplicate_in_file",
      "no_contact",
    ]);
    const first = rows[0]!;
    expect("fitting" in first && first.fitting.configuration_type).toBe("T12");
  });

  it("refuses a chunk out of order, an unknown skip, or a start with no confirmation", () => {
    const payload = applyPayload(rowsOf(FILE), "mdy");
    expect(readApplyChunk(payload.slice(1), 0)).toEqual({ ok: false, error: "Rows must run in file order." });
    expect(readApplyChunk([{ i: 0, raw: {}, skip: "made_up" }], 0)).toEqual({ ok: false, error: "Row 1 has an unknown skip." });
    expect(readStartInput({ fileName: "f.csv", sha256: "a".repeat(64), rowsTotal: 5, dateOrder: "mdy", confirmation: "yes" })).toEqual({
      ok: false,
      error: "Type IMPORT to confirm.",
    });
    expect(readStartInput({ fileName: " f.csv ", sha256: "a".repeat(64), rowsTotal: 5, dateOrder: "dmy", confirmation: "IMPORT" })).toEqual({
      ok: true,
      row: { file_name: "f.csv", file_sha256: "a".repeat(64), rows_total: 5, date_order: "dmy" },
    });
  });

  it("resumes from where the batch is when a chunk's answer was lost", async () => {
    const many = formCsv(Array.from({ length: 230 }, (_, k) => ({ "Email:": `p${k}@example.com` })));
    const sent: number[] = [];
    let rowsDone = 0;
    const applyChunk = async (_: string, start: number, rows: ApplyRawRow[]): Promise<ApplyChunkResponse> => {
      sent.push(start);
      if (start !== rowsDone) return { ok: true, status: "refused", reason: "out_of_order", rowsDone };
      rowsDone += rows.length;
      // The first chunk lands, but its answer never reaches the browser.
      if (start === 0) throw new Error("network");
      return { ok: true, status: "applied", rowsDone, outcomes: rows.map((r) => ({ i: r.i, outcome: "created" as const })) };
    };
    const finish = async () => ({
      ok: true as const,
      status: "applied" as const,
      counts: { rowsTotal: 230, rowsDone: 230, created: 230, matchedEmail: 0, matchedPhone: 0, alreadyImported: 0, skipped: {} },
      fittingRecords: 230,
      newlyApplied: true,
    });

    const first = await runFittingImport({ text: many, batch: { id: "b", rowsDone: 0, rowsTotal: 230 }, order: "mdy", applyChunk, finish });
    expect(first).toMatchObject({ kind: "stopped", rowsDone: 0, error: "network" });

    // Picking the same file again: the page starts from 0, learns the batch is at 100, and carries on.
    const again = await runFittingImport({ text: many, batch: { id: "b", rowsDone: 0, rowsTotal: 230 }, order: "mdy", applyChunk, finish });
    expect(again.kind).toBe("finished");
    expect(sent).toEqual([0, 0, 100, 200]);
    expect(again.outcomes).toHaveLength(130);
  });
});

describe("batches", () => {
  const row: FittingBatchRow = {
    id: "b1",
    file_name: "forms.csv",
    file_sha256: "a".repeat(64),
    date_order: "mdy",
    rows_total: 10,
    rows_done: 10,
    created: 4,
    matched_email: 2,
    matched_phone: 1,
    already_imported: 0,
    skipped: { no_timestamp: 1, no_customer_for_mobile: 1 },
    run_by_user_id: "u1",
    run_by_profile_id: null,
    created_at: "2026-10-31T00:00:00Z",
    applied_at: null,
    rolled_back_at: null,
    undo_counts: null,
  };
  const names = { profiles: new Map(), members: new Map([["u1", "owner@example.com"]]) };

  it("shows a stopped batch whose counts do not add up as a mismatch, and finds the batch for a file", () => {
    const view = toBatchView(row, names);
    expect(view.runBy).toBe("owner@example.com");
    expect(reconcile(view)).toEqual({ complete: true, accounted: 9, reconciles: false });
    expect(batchMismatch(view)).not.toBeNull();
    expect(batchForFile([view], "a".repeat(64))?.id).toBe("b1");
    expect(batchForFile([{ ...view, rolledBackAt: "2026-10-31T01:00:00Z" }], "a".repeat(64))).toBeNull();
  });
});
