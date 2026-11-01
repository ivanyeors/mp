/**
 * The Admin Panel preview of a Fitting import, end to end, apart from the
 * server action it calls (ADR 0039).
 *
 * Pure: the page passes in the server action, so vitest drives the same flow
 * with a fake one.
 *
 *  1. The browser parses the file and stops on a header it cannot import,
 *     before any server call. It reads the date order from the file's dates;
 *     when every date fits both orders, Staff choose.
 *  2. It sends only what matching needs, a chunk at a time: each row's
 *     Timestamp, Email, Mobile and Name, in import order (`importOrder`).
 *     Measurements, health answers, notes and photos stay in the browser
 *     until the import itself.
 *  3. The server re-reads each row itself and answers per row with an outcome,
 *     never PII.
 *  4. The browser settles what only the whole file can see (a row twice, a
 *     Customer an earlier row creates, found again by email or by mobile and
 *     name) and counts everything from its own copy.
 */
import { toCsv } from "@/lib/csv";
import { chunkRows, sha256Hex } from "@/lib/customer-migration/preview";
import {
  parseFittingFormCsv,
  readDateOrder,
  type DateOrder,
  type DateOrderReading,
  type FormField,
  type FormHeaderCheck,
  type RowRepair,
} from "./google-form-csv";
import {
  normaliseRows,
  PLAN_OUTCOMES,
  settleWholeFile,
  type IndexedRawRow,
  type PlanOutcome,
  type RowPreview,
  type SkipReason,
} from "./plan";
import { pickCells, readRawRow } from "./rows";

export { sha256Hex };

/** The page refuses a bigger file before reading it. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const PREVIEW_CHUNK_ROWS = 250;

/** All the preview sends of a row. The name finds one person under another email, or on a shared mobile. */
export const PREVIEW_FIELDS: readonly FormField[] = ["timestamp", "email", "mobile", "name"];

export const OUTCOME_LABELS: Record<PlanOutcome, string> = {
  created: "New customer",
  matched_email: "Matched by email",
  matched_phone: "Matched by mobile",
  already_imported: "Already imported",
  skip: "Skipped",
};

export const OUTCOME_HINTS: Record<PlanOutcome, string> = {
  created: "No customer has this email, or this mobile and name. One is created, with no login, and the fitting is attached to it.",
  matched_email: "Attached to the customer with this email. Their name or mobile is filled in only if it is empty.",
  matched_phone:
    "Attached to the customer with this mobile number: the only one with it, or the one with the same name. A response under an email no customer has joins the customer with the same mobile and name.",
  already_imported: "This form row is already a fitting record. Nothing changes.",
  skip: "Not imported. Download the list to follow these up.",
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  no_timestamp: "Timestamp missing or unreadable",
  no_contact: "No usable email or mobile number",
  duplicate_in_file: "Same row twice in this file",
  no_customer_for_mobile: "No email, and no customer has this mobile number",
  mobile_matches_several: "No email, and several customers share this mobile number, none or more than one with this name",
};

export const REPAIR_LABELS: Record<RowRepair, string> = {
  email_invalid: "Email is not a valid address, matched by mobile instead",
  mobile_unusable: "Mobile number not usable, left off the customer",
  measurement_unreadable: "A measurement is not a number, kept as typed",
  answer_unreadable: "A yes/no answer is neither, kept as typed",
  drive_link_unreadable: "A photo cell is not a Drive link, kept as typed",
  text_shortened: "An answer was too long and was shortened, kept in full",
};

/** The rows as the preview sends them: indexed, and only PREVIEW_FIELDS. */
export function previewPayload(rows: readonly IndexedRawRow["raw"][]): IndexedRawRow[] {
  return rows.map((raw, i) => ({ i, raw: pickCells(raw, PREVIEW_FIELDS) }));
}

/** The server's check of one chunk: only PREVIEW_FIELDS string cells are kept. */
export function readPreviewChunk(
  input: unknown,
  order: unknown,
): { ok: true; rows: IndexedRawRow[]; order: DateOrder } | { ok: false; error: string } {
  if (order !== "mdy" && order !== "dmy") return { ok: false, error: "Choose how the file writes its dates." };
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Send at least one row." };
  if (input.length > PREVIEW_CHUNK_ROWS) return { ok: false, error: `Send at most ${PREVIEW_CHUNK_ROWS} rows at a time.` };
  const seen = new Set<number>();
  const rows: IndexedRawRow[] = [];
  for (const entry of input) {
    const i = (entry as { i?: unknown } | null)?.i;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || seen.has(i)) {
      return { ok: false, error: "Each row needs its own row number." };
    }
    const raw = readRawRow((entry as { raw?: unknown }).raw, PREVIEW_FIELDS, false);
    if (!raw) return { ok: false, error: `Row ${i + 1} has no cells.` };
    seen.add(i);
    rows.push({ i, raw });
  }
  return { ok: true, rows, order };
}

export type PreviewChunkResponse = { ok: true; results: RowPreview[] } | { ok: false; error: string };
export type PreviewChunkFn = (rows: IndexedRawRow[], order: DateOrder) => Promise<PreviewChunkResponse>;

// ─── Counting ────────────────────────────────────────────────────────────────

export type PreviewSummary = {
  rowsTotal: number;
  outcomes: Record<PlanOutcome, number>;
  skipReasons: Partial<Record<SkipReason, number>>;
  /** Rows that would be written with each repair. */
  repairs: Partial<Record<RowRepair, number>>;
  /** Rows that would be written with at least one Drive file. */
  withPhotos: number;
};

export function emptyOutcomes(): Record<PlanOutcome, number> {
  return Object.fromEntries(PLAN_OUTCOMES.map((o) => [o, 0])) as Record<PlanOutcome, number>;
}

export function summarisePreview(previews: readonly RowPreview[], normalised: ReturnType<typeof normaliseRows>): PreviewSummary {
  const byIndex = new Map(normalised.map((n) => [n.i, n.result]));
  const outcomes = emptyOutcomes();
  const skipReasons: Partial<Record<SkipReason, number>> = {};
  const repairs: Partial<Record<RowRepair, number>> = {};
  let withPhotos = 0;
  for (const p of previews) {
    outcomes[p.outcome]++;
    if (p.outcome === "skip" && p.reason) skipReasons[p.reason] = (skipReasons[p.reason] ?? 0) + 1;
    const result = byIndex.get(p.i);
    if (p.outcome === "skip" || p.outcome === "already_imported" || !result?.ok) continue;
    for (const r of result.repairs) repairs[r] = (repairs[r] ?? 0) + 1;
    if (result.row.fitting.drive_files.length > 0) withPhotos++;
  }
  return { rowsTotal: previews.length, outcomes, skipReasons, repairs, withPhotos };
}

// ─── Skipped rows ────────────────────────────────────────────────────────────

/** A skipped row as the browser shows it, from its own copy of the file. `row` is its place in the file, 0-based. */
export type SkippedRow = { row: number; timestamp: string; name: string; email: string; mobile: string; reason: SkipReason };

/** A leading `'` stops a spreadsheet reading a cell as a formula; `cleanCell` strips it again. */
const spreadsheetSafe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function skippedRowsCsv(rows: readonly SkippedRow[]): string {
  return toCsv(
    ["Row", "Timestamp", "Name", "Email", "Mobile", "Reason"],
    rows.map((r) => [
      r.row + 1,
      spreadsheetSafe(r.timestamp),
      spreadsheetSafe(r.name),
      spreadsheetSafe(r.email),
      spreadsheetSafe(r.mobile),
      SKIP_REASON_LABELS[r.reason],
    ]),
  );
}

/**
 * The skipped rows, named from the browser's own copy, in file order. `rows`
 * are in import order, as `outcomes` index them; `row` is the row's place in
 * the file, 0-based, and the CSV and page add the header.
 */
export function skippedRows(
  rows: readonly IndexedRawRow["raw"][],
  outcomes: readonly { i: number; outcome: PlanOutcome; reason?: SkipReason }[],
): SkippedRow[] {
  return outcomes
    .flatMap((o) => {
      if (o.outcome !== "skip" || !o.reason) return [];
      const c = rows[o.i]?.cells ?? {};
      const row = rows[o.i]?.fileRow ?? o.i;
      return [{ row, timestamp: c.timestamp ?? "", name: c.name ?? "", email: c.email ?? "", mobile: c.mobile ?? "", reason: o.reason }];
    })
    .sort((a, b) => a.row - b.row);
}

// ─── The run ─────────────────────────────────────────────────────────────────

export type PreviewRun =
  | { kind: "header_error"; header: FormHeaderCheck }
  | { kind: "dates_conflict"; header: FormHeaderCheck }
  | { kind: "failed"; header: FormHeaderCheck; dates: DateOrderReading; error: string }
  | {
      kind: "done";
      header: FormHeaderCheck;
      dates: DateOrderReading;
      order: DateOrder;
      rowsTotal: number;
      previews: RowPreview[];
      summary: PreviewSummary;
      skipped: SkippedRow[];
    };

/**
 * Preview the file. `order` is Staff's choice, used only when the file's own
 * dates do not prove one; with neither, month first, the sample export's.
 */
export async function runFittingPreview(
  text: string,
  previewChunk: PreviewChunkFn,
  { order: chosen, onProgress }: { order?: DateOrder; onProgress?: (done: number, total: number) => void } = {},
): Promise<PreviewRun> {
  const { header, rows } = parseFittingFormCsv(text);
  if (!header.ok) return { kind: "header_error", header };
  const dates = readDateOrder(rows);
  if (dates.conflict) return { kind: "dates_conflict", header };
  const order: DateOrder = dates.proven ?? chosen ?? "mdy";

  const answered = new Map<number, RowPreview>();
  let done = 0;
  onProgress?.(0, rows.length);
  for (const chunk of chunkRows(previewPayload(rows), { maxRows: PREVIEW_CHUNK_ROWS })) {
    let res: PreviewChunkResponse;
    try {
      res = await previewChunk(chunk, order);
    } catch (e) {
      return { kind: "failed", header, dates, error: e instanceof Error ? e.message : "The preview failed." };
    }
    if (!res.ok) return { kind: "failed", header, dates, error: res.error };
    for (const r of res.results) answered.set(r.i, r);
    done += chunk.length;
    onProgress?.(done, rows.length);
  }

  const normalised = normaliseRows(rows.map((raw, i) => ({ i, raw })), order);
  const answers: RowPreview[] = [];
  for (const { i } of normalised) {
    const answer = answered.get(i);
    if (!answer) return { kind: "failed", header, dates, error: `Row ${i + 1} got no answer from the server.` };
    answers.push(answer);
  }
  const previews = settleWholeFile(normalised, answers);

  return {
    kind: "done",
    header,
    dates,
    order,
    rowsTotal: rows.length,
    previews,
    summary: summarisePreview(previews, normalised),
    skipped: skippedRows(rows, previews),
  };
}
