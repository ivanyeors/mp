export type CsvRow = {
  id: string;
  updated_at?: string | null;
  name?: string | null;
  customer_email?: string | null;
  status?: string | null;
  source?: string | null;
  location_id?: string | null;
  order_number?: string | null;
  stage?: string | null;
  order_status?: string | null;
  suggested_size?: string | null;
  suggested_tier?: string | null;
  assigned_size?: string | null;
  assigned_tier?: string | null;
};

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

const escapeCell = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rowsToCsv(rows: CsvRow[]): string {
  const header = FIELDS.join(",");
  const body = rows.map((row) => FIELDS.map((f) => escapeCell(row[f])).join(","));
  return [header, ...body].join("\r\n");
}
