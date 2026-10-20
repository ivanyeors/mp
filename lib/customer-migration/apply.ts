/**
 * Applying a Shopify customer import from the Admin Panel, end to end, apart
 * from the server actions it calls (PRD-shopify-customer-migration, slice 03;
 * ADR 0028 e).
 *
 * Pure: the page passes the actions in, so vitest drives the same flow with
 * fakes, and the server action shares the chunk check and the row builder.
 *
 *  1. `startShopifyImport` records the Import batch: the file's name and
 *     SHA-256, its row count, the export's date and the address choice.
 *  2. The browser sends the rows in file order, 100 at a time, from the
 *     batch's `rows_done`. Each chunk is one transaction in
 *     `import_shopify_customers`, which re-decides every row against the rows
 *     as they are then. A chunk that does not start at `rows_done` is refused,
 *     so a resumed or retried import never counts a row twice.
 *  3. The browser marks the rows whose email or Shopify id appears twice in
 *     the file. Only it holds the whole file; the server sees one chunk, and
 *     would otherwise create the first copy and skip the second.
 *  4. `finishShopifyImport` reconciles and stamps the batch applied.
 *
 * Tags and Note travel here, unlike in the preview. They are written to
 * `migrated_customers` only, which the service role alone can read.
 */
import { duplicateSkips, normaliseRows, type PlanOutcome, type SkipReason } from "./plan";
import { pickFields, takeChunk } from "./preview";
import {
  parseShopifyCustomersCsv,
  SHOPIFY_FIELDS,
  type NormalisedShopifyRow,
  type ShopifyField,
  type ShopifyRawRow,
} from "./shopify-csv";

/** `import_shopify_customers` takes at most this many rows per call. */
export const APPLY_CHUNK_ROWS = 100;
/** Well under the 1 MB server action limit, with room for its encoding. */
export const APPLY_CHUNK_MAX_BYTES = 512 * 1024;
/** What the operator types to start an import, and to undo one. */
export const IMPORT_CONFIRMATION = "IMPORT";
export const UNDO_CONFIRMATION = "UNDO";

/** Every column the import reads, Tags and Note included. */
export const APPLY_FIELDS: readonly ShopifyField[] = SHOPIFY_FIELDS;

/** Skips only the whole file can see. The server honours these and no others from the browser. */
export type FileSkipReason = "duplicate_email_in_file" | "duplicate_customer_id_in_file";
const FILE_SKIPS: ReadonlySet<string> = new Set<FileSkipReason>(["duplicate_email_in_file", "duplicate_customer_id_in_file"]);

/** One row as the apply sends it. A row skipped for a file-wide duplicate carries no cells at all. */
export type ApplyRawRow = { i: number; raw: ShopifyRawRow; skip?: FileSkipReason };

/** The rows as the apply sends them: indexed, only APPLY_FIELDS, file-wide duplicates marked. */
export function applyPayload(rows: readonly ShopifyRawRow[]): ApplyRawRow[] {
  const dupes = duplicateSkips(normaliseRows(rows.map((raw, i) => ({ i, raw }))));
  return rows.map((raw, i) => {
    const skip = dupes.get(i) as FileSkipReason | undefined;
    return skip ? { i, raw: {}, skip } : { i, raw: pickFields(raw, APPLY_FIELDS) };
  });
}

/**
 * The server's check of one chunk: at most 100 rows, numbered in file order
 * from `startIndex`, and only APPLY_FIELDS string cells, so anything else the
 * request carries is dropped on arrival.
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
    if (i !== startIndex + k) return { ok: false, error: "Rows must run in file order." };
    if (skip !== undefined) {
      if (typeof skip !== "string" || !FILE_SKIPS.has(skip)) return { ok: false, error: `Row ${i + 1} has an unknown skip.` };
      rows.push({ i, raw: {}, skip: skip as FileSkipReason });
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: `Row ${i + 1} has no cells.` };
    rows.push({ i, raw: pickFields(raw as ShopifyRawRow, APPLY_FIELDS) });
  }
  return { ok: true, startIndex, rows };
}

/** One row of `import_shopify_customers`' input (20261020110000_customer_import_apply.sql). */
export type ImportRow = { i: number; skip: SkipReason } | ({ i: number } & NormalisedShopifyRow);

/**
 * What the server hands the SQL function for a chunk. Every row is normalised
 * here from its raw cells, never trusting the browser's own reading. The
 * browser's file-wide duplicate marks are kept, and duplicates within the
 * chunk are found again here.
 */
export function importRows(chunk: readonly ApplyRawRow[]): ImportRow[] {
  const normalised = normaliseRows(chunk.filter((r) => !r.skip).map(({ i, raw }) => ({ i, raw })));
  const byIndex = new Map(normalised.map((n) => [n.i, n.result]));
  const dupes = duplicateSkips(normalised);
  return chunk.map(({ i, skip }): ImportRow => {
    if (skip) return { i, skip };
    const result = byIndex.get(i)!;
    if (!result.ok) return { i, skip: result.reason };
    const dupe = dupes.get(i);
    return dupe ? { i, skip: dupe } : { i, ...result.row };
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

/** Read `import_shopify_customers`' answer. */
export function readImportResult(data: unknown): ApplyChunkResponse {
  const d = (data ?? {}) as { status?: unknown; reason?: unknown; rows_done?: unknown; outcomes?: unknown };
  if (typeof d.rows_done !== "number") return { ok: false, error: "The database gave no answer." };
  if (d.status === "refused") return { ok: true, status: "refused", reason: d.reason as RefusedReason, rowsDone: d.rows_done };
  if (d.status !== "applied" || !Array.isArray(d.outcomes)) return { ok: false, error: "The database gave no answer." };
  return { ok: true, status: "applied", rowsDone: d.rows_done, outcomes: d.outcomes as RowOutcome[] };
}

/** An Import batch's counts, as the server keeps them. */
export type BatchCounts = {
  rowsTotal: number;
  rowsDone: number;
  created: number;
  merged: number;
  alreadyImported: number;
  /** { reason: count } */
  skipped: Partial<Record<SkipReason, number>>;
};

export const skippedTotal = (skipped: BatchCounts["skipped"]) =>
  Object.values(skipped).reduce<number>((sum, n) => sum + (n ?? 0), 0);

export type Reconciliation = { complete: boolean; accounted: number; reconciles: boolean };

/** rows_total = created + merged + already_imported + Σ skipped, over every row. */
export function reconcile(c: BatchCounts): Reconciliation {
  const accounted = c.created + c.merged + c.alreadyImported + skippedTotal(c.skipped);
  const complete = c.rowsDone === c.rowsTotal;
  return { complete, accounted, reconciles: complete && accounted === c.rowsTotal };
}

export type FinishStatus = "applied" | "incomplete" | "mismatch" | "undone";

export type FinishResponse =
  | {
      ok: true;
      status: FinishStatus;
      counts: BatchCounts;
      /** migrated_customers rows the batch holds, created and merged: the second half of the reconcile. */
      rows: { created: number; merged: number };
      /** This call stamped the batch applied (and recorded the audit row). */
      newlyApplied: boolean;
    }
  | { ok: false; error: string };

/** Read `finish_shopify_import`'s answer. */
export function readFinishResult(data: unknown): FinishResponse {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = d.status as FinishStatus;
  if (!["applied", "incomplete", "mismatch", "undone"].includes(status)) {
    return { ok: false, error: "The database gave no answer." };
  }
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : 0);
  return {
    ok: true,
    status,
    counts: {
      rowsTotal: num("rows_total"),
      rowsDone: num("rows_done"),
      created: num("created"),
      merged: num("merged"),
      alreadyImported: num("already_imported"),
      skipped: (d.skipped ?? {}) as BatchCounts["skipped"],
    },
    rows: { created: num("created_rows"), merged: num("merged_rows") },
    newlyApplied: d.newly_applied === true,
  };
}

// ─── Starting a batch ────────────────────────────────────────────────────────

export type StartImportInput = {
  fileName: string;
  sha256: string;
  rowsTotal: number;
  withAddresses: boolean;
  /** YYYY-MM-DD: the day the owner exported the file. */
  exportedAt: string;
  /** The operator typed IMPORT_CONFIRMATION. */
  confirmation: string;
};

export type StartImportRow = {
  file_name: string;
  file_sha256: string;
  rows_total: number;
  with_addresses: boolean;
  exported_at: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** No export predates the shop. */
const EARLIEST_EXPORT = "2015-01-01";

/** `YYYY-MM-DD` in the browser's own time zone. */
export function localIsoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The server's check of a new batch. `today` is the server's date; a day of
 * grace covers Singapore being ahead of UTC.
 */
export function readStartInput(
  input: unknown,
  today: string,
): { ok: true; row: StartImportRow } | { ok: false; error: string } {
  const v = (input ?? {}) as Partial<Record<keyof StartImportInput, unknown>>;
  if (v.confirmation !== IMPORT_CONFIRMATION) return { ok: false, error: `Type ${IMPORT_CONFIRMATION} to confirm.` };
  const fileName = typeof v.fileName === "string" ? v.fileName.trim().slice(0, 255) : "";
  if (!fileName) return { ok: false, error: "The file has no name." };
  if (typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256)) return { ok: false, error: "The file has no fingerprint." };
  if (typeof v.rowsTotal !== "number" || !Number.isInteger(v.rowsTotal) || v.rowsTotal < 1) {
    return { ok: false, error: "The file has no rows." };
  }
  if (typeof v.withAddresses !== "boolean") return { ok: false, error: "Choose whether to import addresses." };
  const exportedAt = typeof v.exportedAt === "string" ? v.exportedAt : "";
  const parsed = ISO_DATE.test(exportedAt) ? new Date(`${exportedAt}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== exportedAt) {
    return { ok: false, error: "Give the date the file was exported." };
  }
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 1);
  if (exportedAt < EARLIEST_EXPORT || parsed > latest) {
    return { ok: false, error: "The export date must be a day the file could have been exported." };
  }
  return {
    ok: true,
    row: { file_name: fileName, file_sha256: v.sha256, rows_total: v.rowsTotal, with_addresses: v.withAddresses, exported_at: exportedAt },
  };
}

// ─── The run ─────────────────────────────────────────────────────────────────

export type ApplyChunkFn = (batchId: string, startIndex: number, rows: ApplyRawRow[]) => Promise<ApplyChunkResponse>;
export type FinishFn = (batchId: string) => Promise<FinishResponse>;

export type ImportRun =
  | { kind: "finished"; result: Extract<FinishResponse, { ok: true }> }
  /** Stopped part-way. Picking the same file continues from `rowsDone`. */
  | { kind: "stopped"; rowsDone: number; error: string };

/**
 * Send the file's rows from the batch's `rowsDone`, then finish. A refusal
 * that says the batch is further on than we are (a chunk that landed but
 * whose answer was lost) moves on from there; any other refusal or failure
 * stops, and the same file resumes it.
 */
export async function runShopifyImport({
  text,
  batch,
  applyChunk,
  finish,
  onProgress,
}: {
  text: string;
  batch: { id: string; rowsDone: number; rowsTotal: number };
  applyChunk: ApplyChunkFn;
  finish: FinishFn;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportRun> {
  const { header, rows } = parseShopifyCustomersCsv(text);
  if (!header.ok || rows.length !== batch.rowsTotal) {
    return { kind: "stopped", rowsDone: batch.rowsDone, error: "This file does not match the import it would continue." };
  }
  const payload = applyPayload(rows);
  let next = batch.rowsDone;
  onProgress?.(next, rows.length);
  while (next < rows.length) {
    const chunk = takeChunk(payload, next, { maxRows: APPLY_CHUNK_ROWS, maxBytes: APPLY_CHUNK_MAX_BYTES });
    let res: ApplyChunkResponse;
    try {
      res = await applyChunk(batch.id, next, chunk);
    } catch (e) {
      return { kind: "stopped", rowsDone: next, error: e instanceof Error ? e.message : "The import stopped." };
    }
    if (!res.ok) return { kind: "stopped", rowsDone: next, error: res.error };
    if (res.status === "refused") {
      if (res.reason === "out_of_order" && res.rowsDone > next && res.rowsDone <= rows.length) {
        next = res.rowsDone;
        onProgress?.(next, rows.length);
        continue;
      }
      return { kind: "stopped", rowsDone: res.rowsDone, error: REFUSED_LABELS[res.reason] ?? "The import was refused." };
    }
    next = res.rowsDone;
    onProgress?.(next, rows.length);
  }

  let done: FinishResponse;
  try {
    done = await finish(batch.id);
  } catch (e) {
    return { kind: "stopped", rowsDone: next, error: e instanceof Error ? e.message : "The import could not finish." };
  }
  if (!done.ok) return { kind: "stopped", rowsDone: next, error: done.error };
  return { kind: "finished", result: done };
}

export const REFUSED_LABELS: Record<RefusedReason, string> = {
  out_of_order: "Another tab is running this import, or it moved on. Pick the same file again to continue.",
  past_end: "This file has more rows than the import it would continue.",
  applied: "This import has already finished.",
  undone: "This import was undone.",
};
