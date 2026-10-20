/**
 * Synthetic Shopify customer exports for tests. Every name is invented and
 * every email is at example.com: a real export is PII and is never committed
 * (PRD-shopify-customer-migration, hazard 3).
 */
import { toCsv } from "@/lib/csv";

/** The header row of Shopify's current Plain CSV customer export. */
export const SHOPIFY_EXPORT_HEADER = [
  "Customer ID",
  "First Name",
  "Last Name",
  "Email",
  "Accepts Email Marketing",
  "Default Address Company",
  "Default Address Address1",
  "Default Address Address2",
  "Default Address City",
  "Default Address Province Code",
  "Default Address Country Code",
  "Default Address Zip",
  "Default Address Phone",
  "Phone",
  "Accepts SMS Marketing",
  "Total Spent",
  "Total Orders",
  "Note",
  "Tax Exempt",
  "Tags",
] as const;

export type ExportColumn = (typeof SHOPIFY_EXPORT_HEADER)[number];
export type ExportRow = Partial<Record<ExportColumn, string>>;

export function exportCsv(rows: ExportRow[], header: readonly string[] = SHOPIFY_EXPORT_HEADER): string {
  return toCsv(header, rows.map((r) => header.map((h) => r[h as ExportColumn] ?? "")));
}

/** A complete row with a Singapore default address. */
export function buyer(n: number, over: ExportRow = {}): ExportRow {
  return {
    "Customer ID": String(7_000_000_000_000 + n),
    "First Name": `Test${n}`,
    "Last Name": "Buyer",
    Email: `buyer${n}@example.com`,
    "Accepts Email Marketing": n % 2 ? "yes" : "no",
    "Default Address Address1": `${n} Example Road`,
    "Default Address City": "Singapore",
    "Default Address Country Code": "SG",
    "Default Address Zip": "238801",
    Phone: "+6591234567",
    "Accepts SMS Marketing": "no",
    "Total Spent": "610.00",
    "Total Orders": "1",
    "Tax Exempt": "no",
    ...over,
  };
}

/**
 * Five rows, one of each kind the preview must tell apart:
 *  1. create, with a postcode a spreadsheet stripped (18956 → 018956);
 *  2. merge into an existing Customer who has an account;
 *  3. phone only: no email;
 *  4. already imported (its Shopify id is in migrated_customers);
 *  5. a malformed email.
 */
export const FIVE_ROWS: ExportRow[] = [
  {
    "Customer ID": "'7000000000001",
    "First Name": "Ana",
    "Last Name": "Example",
    Email: "Ana.Example@Example.com",
    "Accepts Email Marketing": "yes",
    "Default Address Address1": "1 Example Street",
    "Default Address City": "",
    "Default Address Country Code": "SG",
    "Default Address Zip": "18956",
    Phone: "'+6591234567",
    "Accepts SMS Marketing": "yes",
    "Total Spent": "1220.00",
    "Total Orders": "2",
    Note: "Test note",
    "Tax Exempt": "no",
    Tags: "neck, vip",
  },
  buyer(2, { Email: "ben.sample@example.com", "First Name": "Ben", "Total Orders": "0", "Total Spent": "0.00" }),
  buyer(3, { Email: "", Phone: "+6581234567" }),
  buyer(4, { Email: "dev.sample@example.com" }),
  buyer(5, { Email: "ema@example" }),
];

/** Rows 2 and 4 of FIVE_ROWS, as `customer_import_preview_matches` returns them. */
export const FIVE_ROWS_MATCHES = [
  {
    match: "email" as const,
    key: "ben.sample@example.com",
    customer_id: "00000000-0000-4000-8000-000000000002",
    has_account: true,
    has_first_name: true,
    has_last_name: false,
    has_phone: false,
    has_address: false,
    migrated: false,
    migrated_shopify_customer_id: null,
  },
  {
    match: "shopify_id" as const,
    key: "7000000000004",
    customer_id: "00000000-0000-4000-8000-000000000004",
    has_account: null,
    has_first_name: null,
    has_last_name: null,
    has_phone: null,
    has_address: null,
    migrated: true,
    migrated_shopify_customer_id: "7000000000004",
  },
];
