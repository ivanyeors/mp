/**
 * Applying a Fitting import from the Admin Panel, end to end, apart from the
 * server actions it calls (ADR 0042 e).
 *
 * Pure: the page passes the actions in, so vitest drives the same flow with
 * fakes, and the server action shares the chunk check and the row builder.
 *
 *  1. `startFittingImport` records the batch: the file's name and SHA-256,
 *     its row count, and how its dates are read.
 *  2. The browser sends every row's cells in import order (`importOrder`:
 *     the rows with an email first, then the rest, each in file order), 100
 *     at a time, from the batch's `rows_done`. Each chunk is one transaction in
 *     `import_fitting_rows`, which re-decides every row against the rows as
 *     they are then. A chunk that does not start at `rows_done` is refused,
 *     so a resumed or retried import never counts a row twice.
 *  3. The browser marks a row whose key an earlier row in the file has: only
 *     it holds the whole file.
 *  4. `finishFittingImport` reconciles and stamps the batch applied.
 */
import { IMPORT_CONFIRMATION, UNDO_CONFIRMATION, localIsoDate } from "@/lib/customer-migration/apply";
import { takeChunk } from "@/lib/customer-migration/preview";
import { parseFittingFormCsv, type DateOrder, type FittingColumns, type FormRawRow } from "./google-form-csv";
import { duplicateSkips, normaliseRows, type PlanOutcome, type SkipReason } from "./plan";
import { readRawRow } from "./rows";

export { IMPORT_CONFIRMATION, UNDO_CONFIRMATION, localIsoDate };

/** `import_fitting_rows` takes at most this many rows per call. */
export const APPLY_CHUNK_ROWS = 100;
/** Well under the 1 MB server action limit, with room for its encoding. */
export const APPLY_CHUNK_MAX_BYTES = 512 * 1024;

/** One row as the apply sends it. A row skipped as a duplicate carries no cells at all. */
export type ApplyRawRow = { i: number; raw: FormRawRow; skip?: "duplicate_in_file" };

/** The rows as the apply sends them: indexed in import order, every cell, duplicates marked. */
export function applyPayload(rows: readonly FormRawRow[], order: DateOrder): ApplyRawRow[] {
  const dupes = duplicateSkips(normaliseRows(rows.map((raw, i) => ({ i, raw })), order));
  return rows.map(({ cells, other }, i) =>
    dupes.has(i) ? { i, raw: { cells: {}, other: {} }, skip: "duplicate_in_file" } : { i, raw: { cells, other } },
  );
}

/**
 * The server's check of one chunk: at most 100 rows, numbered in import order
 * from `startIndex`, each read back with `readRawRow`.
 */
export function readApplyChunk(
  input: unknown,
  startIndex: unknown,
): { ok: true; startIndex: number; rows: ApplyRawRow[] } | { ok: false; error: string } {
  if (typeof startIndex !== "number" || !Number.isInteger(startIndex) || startIndex < 0) {
    return { ok: false, error: "The chunk needs the row it starts at." };
  }
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Send at least one row." };
  if (input.length > APPLY_CHUNK_ROWS) return { ok: false, error: `Send at most ${APPLY_CHUNK_ROWS} rows at a time.` };
  const rows: ApplyRawRow[] = [];
  for (const [k, entry] of input.entries()) {
    const { i, raw, skip } = (entry ?? {}) as { i?: unknown; raw?: unknown; skip?: unknown };
    if (i !== startIndex + k) return { ok: false, error: "Rows must run in order." };
    if (skip !== undefined) {
      if (skip !== "duplicate_in_file") return { ok: false, error: `Row ${i + 1} has an unknown skip.` };
      rows.push({ i, raw: { cells: {}, other: {} }, skip });
      continue;
    }
    const read = readRawRow(raw);
    if (!read) return { ok: false, error: `Row ${i + 1} has no cells.` };
    rows.push({ i, raw: read });
  }
  return { ok: true, startIndex, rows };
}

/** One row of `import_fitting_rows`' input (20261101100000_customer_fittings.sql). */
export type ImportRow =
  | { i: number; skip: SkipReason }
  | { i: number; key: string; email: string | null; phone: string | null; name: string | null; fitting: FittingColumns };

/**
 * What the server hands the SQL function for a chunk. Every row is normalised
 * here from its raw cells, with the batch's own date order, never trusting
 * the browser's reading. The browser's duplicate marks are kept, and
 * duplicates within the chunk are found again here.
 */
export function importRows(chunk: readonly ApplyRawRow[], order: DateOrder, now?: number): ImportRow[] {
  const normalised = normaliseRows(
    chunk.filter((r) => !r.skip).map(({ i, raw }) => ({ i, raw })),
    order,
    now,
  );
  const byIndex = new Map(normalised.map((n) => [n.i, n.result]));
  const dupes = duplicateSkips(normalised);
  return chunk.map(({ i, skip }): ImportRow => {
    if (skip) return { i, skip };
    const result = byIndex.get(i)!;
    if (!result.ok) return { i, skip: result.reason };
    if (dupes.has(i)) return { i, skip: "duplicate_in_file" };
    const { key, email, phone, name, fitting } = result.row;
    return { i, key, email, phone, name, fitting };
  });
}

// ─── Server answers ──────────────────────────────────────────────────────────

/** One row's outcome as the database decided it. No PII: the browser holds the row. */
export type RowOutcome = { i: number; outcome: PlanOutcome; reason?: SkipReason };

export type RefusedReason = "out_of_order" | "past_end" | "applied" | "undone";

export type ApplyChunkResponse =
  | { ok: true; status: "applied"; rowsDone: number; outcomes: RowOutcome[] }
  | { ok: true; status: "refused"; reason: RefusedReason; rowsDone: number }
  | { ok: false; error: string };

export function readImportResult(data: unknown): ApplyChunkResponse {
  const d = (data ?? {}) as { status?: unknown; reason?: unknown; rows_done?: unknown; outcomes?: unknown };
  if (typeof d.rows_done !== "number") return { ok: false, error: "The database gave no answer." };
  if (d.status === "refused") return { ok: true, status: "refused", reason: d.reason as RefusedReason, rowsDone: d.rows_done };
  if (d.status !== "applied" || !Array.isArray(d.outcomes)) return { ok: false, error: "The database gave no answer." };
  return { ok: true, status: "applied", rowsDone: d.rows_done, outcomes: d.outcomes as RowOutcome[] };
}

/** A batch's counts, as the server keeps them. */
export type BatchCounts = {
  rowsTotal: number;
  rowsDone: number;
  created: number;
  matchedEmail: number;
  matchedPhone: number;
  alreadyImported: number;
  skipped: Partial<Record<SkipReason, number>>;
};

export const skippedTotal = (skipped: BatchCounts["skipped"]) =>
  Object.values(skipped).reduce<number>((sum, n) => sum + (n ?? 0), 0);

/** Fitting records a batch wrote: one per created Customer and per match. */
export const recordsWritten = (c: BatchCounts) => c.created + c.matchedEmail + c.matchedPhone;

export type Reconciliation = { complete: boolean; accounted: number; reconciles: boolean };

export function reconcile(c: BatchCounts): Reconciliation {
  const accounted = recordsWritten(c) + c.alreadyImported + skippedTotal(c.skipped);
  const complete = c.rowsDone === c.rowsTotal;
  return { complete, accounted, reconciles: complete && accounted === c.rowsTotal };
}

export type FinishStatus = "applied" | "incomplete" | "mismatch" | "undone";

export type FinishResponse =
  | { ok: true; status: FinishStatus; counts: BatchCounts; fittingRecords: number; newlyApplied: boolean }
  | { ok: false; error: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function countsFrom(d: Record<string, unknown>): BatchCounts {
  return {
    rowsTotal: num(d.rows_total),
    rowsDone: num(d.rows_done),
    created: num(d.created),
    matchedEmail: num(d.matched_email),
    matchedPhone: num(d.matched_phone),
    alreadyImported: num(d.already_imported),
    skipped: (d.skipped && typeof d.skipped === "object" ? d.skipped : {}) as BatchCounts["skipped"],
  };
}

export function readFinishResult(data: unknown): FinishResponse {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = d.status as FinishStatus;
  if (!["applied", "incomplete", "mismatch", "undone"].includes(status)) return { ok: false, error: "The database gave no answer." };
  return { ok: true, status, counts: countsFrom(d), fittingRecords: num(d.fitting_records), newlyApplied: d.newly_applied === true };
}

// ─── Starting a batch ────────────────────────────────────────────────────────

export type StartImportInput = {
  fileName: string;
  sha256: string;
  rowsTotal: number;
  dateOrder: DateOrder;
  /** The operator typed IMPORT_CONFIRMATION. */
  confirmation: string;
};

export type StartImportRow = { file_name: string; file_sha256: string; rows_total: number; date_order: DateOrder };

export function readStartInput(input: unknown): { ok: true; row: StartImportRow } | { ok: false; error: string } {
  const v = (input ?? {}) as Partial<Record<keyof StartImportInput, unknown>>;
  if (v.confirmation !== IMPORT_CONFIRMATION) return { ok: false, error: `Type ${IMPORT_CONFIRMATION} to confirm.` };
  const fileName = typeof v.fileName === "string" ? v.fileName.trim().slice(0, 255) : "";
  if (!fileName) return { ok: false, error: "The file has no name." };
  if (typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256)) return { ok: false, error: "The file has no fingerprint." };
  if (typeof v.rowsTotal !== "number" || !Number.isInteger(v.rowsTotal) || v.rowsTotal < 1) {
    return { ok: false, error: "The file has no rows." };
  }
  if (v.dateOrder !== "mdy" && v.dateOrder !== "dmy") return { ok: false, error: "Choose how the file writes its dates." };
  return { ok: true, row: { file_name: fileName, file_sha256: v.sha256, rows_total: v.rowsTotal, date_order: v.dateOrder } };
}

// ─── The run ─────────────────────────────────────────────────────────────────

export type ApplyChunkFn = (batchId: string, startIndex: number, rows: ApplyRawRow[]) => Promise<ApplyChunkResponse>;
export type FinishFn = (batchId: string) => Promise<FinishResponse>;

export type ImportRun =
  | { kind: "finished"; result: Extract<FinishResponse, { ok: true }>; outcomes: RowOutcome[] }
  /** Stopped part-way. Picking the same file continues from `rowsDone`. */
  | { kind: "stopped"; rowsDone: number; error: string; outcomes: RowOutcome[] };

export const REFUSED_LABELS: Record<RefusedReason, string> = {
  out_of_order: "Another tab is running this import, or it moved on. Pick the same file again to continue.",
  past_end: "This file has more rows than the import it would continue.",
  applied: "This import has already finished.",
  undone: "This import was undone.",
};

/**
 * Send the file's rows from the batch's `rowsDone`, then finish. A refusal
 * that says the batch is further on than we are (a chunk that landed but whose
 * answer was lost) moves on from there; any other refusal or failure stops,
 * and the same file resumes it.
 */
export async function runFittingImport({
  text,
  batch,
  order,
  applyChunk,
  finish,
  onProgress,
}: {
  text: string;
  batch: { id: string; rowsDone: number; rowsTotal: number };
  order: DateOrder;
  applyChunk: ApplyChunkFn;
  finish: FinishFn;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportRun> {
  const outcomes: RowOutcome[] = [];
  const { header, rows } = parseFittingFormCsv(text);
  if (!header.ok || rows.length !== batch.rowsTotal) {
    return { kind: "stopped", rowsDone: batch.rowsDone, error: "This file does not match the import it would continue.", outcomes };
  }
  const payload = applyPayload(rows, order);
  let next = batch.rowsDone;
  onProgress?.(next, rows.length);
  while (next < rows.length) {
    const chunk = takeChunk(payload, next, { maxRows: APPLY_CHUNK_ROWS, maxBytes: APPLY_CHUNK_MAX_BYTES });
    let res: ApplyChunkResponse;
    try {
      res = await applyChunk(batch.id, next, chunk);
    } catch (e) {
      return { kind: "stopped", rowsDone: next, error: e instanceof Error ? e.message : "The import stopped.", outcomes };
    }
    if (!res.ok) return { kind: "stopped", rowsDone: next, error: res.error, outcomes };
    if (res.status === "refused") {
      if (res.reason === "out_of_order" && res.rowsDone > next && res.rowsDone <= rows.length) {
        next = res.rowsDone;
        onProgress?.(next, rows.length);
        continue;
      }
      return { kind: "stopped", rowsDone: res.rowsDone, error: REFUSED_LABELS[res.reason] ?? "The import was refused.", outcomes };
    }
    outcomes.push(...res.outcomes);
    next = res.rowsDone;
    onProgress?.(next, rows.length);
  }

  let done: FinishResponse;
  try {
    done = await finish(batch.id);
  } catch (e) {
    return { kind: "stopped", rowsDone: next, error: e instanceof Error ? e.message : "The import could not finish.", outcomes };
  }
  if (!done.ok) return { kind: "stopped", rowsDone: next, error: done.error, outcomes };
  return { kind: "finished", result: done, outcomes };
}
