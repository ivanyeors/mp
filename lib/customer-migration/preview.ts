import { toCsv } from "@/lib/csv";
import {
  duplicateSkips,
  normaliseRows,
  PLAN_OUTCOMES,
  type IndexedNormalised,
  type IndexedRawRow,
  type PlanOutcome,
  type RowPreview,
  type SkipReason,
} from "./plan";
import {
  cleanCell,
  parseShopifyCustomersCsv,
  SHOPIFY_FIELDS,
  type RowRepair,
  type ShopifyField,
  type ShopifyHeaderCheck,
  type ShopifyRawRow,
} from "./shopify-csv";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const PREVIEW_CHUNK_ROWS = 250;
export const PREVIEW_CHUNK_MAX_BYTES = 512 * 1024;

export const PREVIEW_FIELDS: readonly ShopifyField[] = SHOPIFY_FIELDS.filter(
  (f) => f !== "tags" && f !== "note",
);

export const OUTCOME_LABELS: Record<PlanOutcome, string> = {
  create: "Would create",
  merge: "Would merge",
  already_imported: "Already imported",
  skip: "Skipped",
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  no_email: "No email (a phone-only customer cannot sign in)",
  invalid_email: "Email is not a valid address",
  duplicate_email_in_file: "Same email twice in this file",
  duplicate_customer_id_in_file: "Same Shopify customer ID twice in this file",
  email_already_migrated: "Email already imported for a different Shopify customer",
};

export const REPAIR_LABELS: Record<RowRepair, string> = {
  zip_repaired: "Singapore postcode had lost its leading 0, restored",
  phone_dropped: "Phone number not usable, left out",
  address_incomplete: "Address incomplete, imported without it",
  total_orders_invalid: "Total Orders unreadable, counted as 0",
  total_spent_invalid: "Total Spent unreadable, counted as 0",
};

export function pickFields(raw: ShopifyRawRow, fields: readonly ShopifyField[]): ShopifyRawRow {
  const out: ShopifyRawRow = {};
  for (const f of fields) {
    const v = raw[f];
    if (typeof v === "string" && v !== "") out[f] = v;
  }
  return out;
}

export function previewPayload(rows: readonly ShopifyRawRow[]): IndexedRawRow[] {
  return rows.map((raw, i) => ({ i, raw: pickFields(raw, PREVIEW_FIELDS) }));
}

const encoder = new TextEncoder();
export const jsonBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

export function takeChunk<T>(
  rows: readonly T[],
  start: number,
  { maxRows = PREVIEW_CHUNK_ROWS, maxBytes = PREVIEW_CHUNK_MAX_BYTES } = {},
): T[] {
  const chunk: T[] = [];
  let bytes = 2;
  for (let k = start; k < rows.length && chunk.length < maxRows; k++) {
    const size = jsonBytes(rows[k]) + 1;
    if (chunk.length && bytes + size > maxBytes) break;
    chunk.push(rows[k]);
    bytes += size;
  }
  return chunk;
}

export function chunkRows<T>(
  rows: readonly T[],
  limits: { maxRows?: number; maxBytes?: number } = {},
): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; ) {
    const chunk = takeChunk(rows, start, limits);
    chunks.push(chunk);
    start += chunk.length;
  }
  return chunks;
}

export function readPreviewChunk(
  input: unknown,
): { ok: true; rows: IndexedRawRow[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Send at least one row." };
  if (input.length > PREVIEW_CHUNK_ROWS) {
    return { ok: false, error: `Send at most ${PREVIEW_CHUNK_ROWS} rows at a time.` };
  }
  const seen = new Set<number>();
  const rows: IndexedRawRow[] = [];
  for (const entry of input) {
    const i = (entry as { i?: unknown } | null)?.i;
    const raw = (entry as { raw?: unknown } | null)?.raw;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || seen.has(i)) {
      return { ok: false, error: "Each row needs its own row number." };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Row ${i + 1} has no cells.` };
    }
    seen.add(i);
    rows.push({ i, raw: pickFields(raw as ShopifyRawRow, PREVIEW_FIELDS) });
  }
  return { ok: true, rows };
}

export type PreviewChunkResponse = { ok: true; results: RowPreview[] } | { ok: false; error: string };
export type PreviewChunkFn = (rows: IndexedRawRow[]) => Promise<PreviewChunkResponse>;

export type PreviewSummary = {
  rowsTotal: number;
  outcomes: Record<PlanOutcome, number>;
  skipReasons: Partial<Record<SkipReason, number>>;
  repairs: Partial<Record<RowRepair, number>>;
  buyers: number;
  nonBuyers: number;
  consented: number;
  notConsented: number;
};

export function summarisePreview(
  previews: readonly RowPreview[],
  normalised: readonly IndexedNormalised[],
): PreviewSummary {
  const byIndex = new Map(normalised.map((n) => [n.i, n.result]));
  const outcomes = Object.fromEntries(PLAN_OUTCOMES.map((o) => [o, 0])) as Record<PlanOutcome, number>;
  const skipReasons: Partial<Record<SkipReason, number>> = {};
  const repairs: Partial<Record<RowRepair, number>> = {};
  let buyers = 0;
  let nonBuyers = 0;
  let consented = 0;
  let notConsented = 0;
  for (const p of previews) {
    outcomes[p.outcome]++;
    if (p.outcome === "skip" && p.reason) skipReasons[p.reason] = (skipReasons[p.reason] ?? 0) + 1;
    for (const r of p.repairs) repairs[r] = (repairs[r] ?? 0) + 1;
    const result = byIndex.get(p.i);
    if ((p.outcome === "create" || p.outcome === "merge") && result?.ok) {
      if (result.row.shopify_orders_count >= 1) buyers++;
      else nonBuyers++;
      if (result.row.email_marketing_at_export === "yes") consented++;
      else notConsented++;
    }
  }
  return { rowsTotal: previews.length, outcomes, skipReasons, repairs, buyers, nonBuyers, consented, notConsented };
}

export type SkippedRow = { row: number; email: string; name: string; reason: SkipReason };

const spreadsheetSafe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function skippedRowsCsv(rows: readonly SkippedRow[]): string {
  return toCsv(
    ["Row", "Email", "Name", "Reason"],
    rows.map((r) => [r.row, spreadsheetSafe(r.email), spreadsheetSafe(r.name), SKIP_REASON_LABELS[r.reason]]),
  );
}

export type PreviewRun =
  | { kind: "header_error"; header: ShopifyHeaderCheck }
  | { kind: "empty"; header: ShopifyHeaderCheck }
  | { kind: "failed"; header: ShopifyHeaderCheck; error: string }
  | {
      kind: "done";
      header: ShopifyHeaderCheck;
      previews: RowPreview[];
      summary: PreviewSummary;
      skipped: SkippedRow[];
    };

export async function runShopifyPreview(
  text: string,
  previewChunk: PreviewChunkFn,
  onProgress?: (done: number, total: number) => void,
): Promise<PreviewRun> {
  const { header, rows } = parseShopifyCustomersCsv(text);
  if (!header.ok) return { kind: "header_error", header };
  if (rows.length === 0) return { kind: "empty", header };

  const answered = new Map<number, RowPreview>();
  let done = 0;
  onProgress?.(0, rows.length);
  for (const chunk of chunkRows(previewPayload(rows))) {
    let res: PreviewChunkResponse;
    try {
      res = await previewChunk(chunk);
    } catch (e) {
      return { kind: "failed", header, error: e instanceof Error ? e.message : "The preview failed." };
    }
    if (!res.ok) return { kind: "failed", header, error: res.error };
    for (const r of res.results) answered.set(r.i, r);
    done += chunk.length;
    onProgress?.(done, rows.length);
  }

  const normalised = normaliseRows(rows.map((raw, i) => ({ i, raw })));
  const fileDupes = duplicateSkips(normalised);
  const previews: RowPreview[] = [];
  for (const { i } of normalised) {
    const answer = answered.get(i);
    if (!answer) return { kind: "failed", header, error: `Row ${i + 1} got no answer from the server.` };
    const dupe = fileDupes.get(i);
    previews.push(dupe ? { i, outcome: "skip", reason: dupe, repairs: [] } : answer);
  }

  const skipped: SkippedRow[] = previews.flatMap((p) => {
    if (p.outcome !== "skip" || !p.reason) return [];
    const raw = rows[p.i];
    const name = [cleanCell(raw.firstName), cleanCell(raw.lastName)].filter(Boolean).join(" ");
    return [{ row: p.i + 1, email: cleanCell(raw.email), name, reason: p.reason }];
  });

  return { kind: "done", header, previews, summary: summarisePreview(previews, normalised), skipped };
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
