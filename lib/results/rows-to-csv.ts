/**
 * Slice 05 — Results bulk export.
 * Pure CSV builder for selected Result rows. RFC-4180 escaping, stable field order.
 */

export type CsvRow = {
  id: string;
  updated_at?: string | null;
  name?: string | null;
  customer_email?: string | null;
  status?: string | null;
  source?: string | null;
  location_id?: string | null;
  order_number?: string | null;
  /** Derived queue stage (see lib/results/result-stage) — an exported queue stays legible. */
  stage?: string | null;
  order_status?: string | null;
  suggested_size?: string | null;
  suggested_tier?: string | null;
  assigned_size?: string | null;
  assigned_tier?: string | null;
};

// Stable field order — header row is derived from these keys.
const FIELDS = [
  "id",
  "updated_at",
  "name",
  "customer_email",
  "status",
  "source",
  "location_id",
  "stage",
  "order_number",
  "order_status",
  "suggested_size",
  "suggested_tier",
  "assigned_size",
  "assigned_tier",
] as const;

// RFC-4180: wrap in quotes and double interior quotes when the field contains
// a comma, double-quote, CR, or LF.
const escapeCell = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rowsToCsv(rows: CsvRow[]): string {
  const header = FIELDS.join(",");
  const body = rows.map((row) => FIELDS.map((f) => escapeCell(row[f])).join(","));
  return [header, ...body].join("\r\n");
}
