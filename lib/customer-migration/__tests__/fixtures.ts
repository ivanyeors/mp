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

// ─── The SQL agreement fixture (slice 03) ────────────────────────────────────

/**
 * Customers already on the platform before AGREEMENT_EXPORT is imported. The
 * SQL assert files (supabase/tests/customer-import/) seed exactly these rows
 * from cases.json, and the TS preview reads them as an `ExistingLookup`.
 * `migrated` is the Shopify id an earlier batch imported them with.
 */
export type SeedCustomer = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  has_account: boolean;
  tags: string[];
  notes: string | null;
  total_orders: number;
  total_spent: number;
  address: { recipient: string; line1: string; city: string; postal_code: string; country: string } | null;
  migrated: string | null;
};

const seed = (n: number, over: Partial<SeedCustomer> & Pick<SeedCustomer, "email">): SeedCustomer => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  first_name: null,
  last_name: null,
  phone: null,
  has_account: false,
  tags: [],
  notes: null,
  total_orders: 0,
  total_spent: 0,
  address: null,
  migrated: null,
  ...over,
});

export const AGREEMENT_SEED: SeedCustomer[] = [
  // Signed up, with platform-owned tags, notes and totals a merge must not touch.
  seed(1, {
    email: "kim.account@example.com",
    first_name: "Kim",
    has_account: true,
    tags: ["platform-tag"],
    notes: "Platform staff note",
    total_orders: 3,
    total_spent: 450,
  }),
  // No account, already has an address: a merge adds none.
  seed(2, {
    email: "lee.noaccount@example.com",
    last_name: "Lee",
    phone: "+6590000002",
    address: { recipient: "Lee", line1: "2 Platform Road", city: "Singapore", postal_code: "238802", country: "SG" },
  }),
  // Stored with capitals: matched on lower(email), and kept as stored.
  seed(3, { email: "Mixed.Case@Example.com", first_name: "Max", last_name: "Case" }),
  // Migrated customers from an earlier batch.
  seed(4, { email: "dana.migrated@example.com", first_name: "Dana", migrated: "7000000000101" }),
  seed(5, { email: "erin.old@example.com", first_name: "Erin", migrated: "7000000000102" }),
];

const noAddress: ExportRow = {
  "Default Address Address1": "",
  "Default Address City": "",
  "Default Address Country Code": "",
  "Default Address Zip": "",
};

/**
 * One row for every outcome the preview and the SQL function must agree on,
 * against AGREEMENT_SEED. The import sends it in two chunks split between rows
 * 10 and 11, so one duplicate pair is decided by the browser alone.
 */
export const AGREEMENT_EXPORT: ExportRow[] = [
  /*  0 */ buyer(201, { "Default Address Zip": "18956" }), // create, zip repaired
  /*  1 */ buyer(202, { Email: "Kim.Account@example.com", "First Name": "Kimberly", "Last Name": "Tan", Phone: "+6590000001" }), // merge: fills last name and phone, adds the address
  /*  2 */ buyer(203, { Email: "lee.noaccount@example.com", "First Name": "Lee", "Last Name": "Other" }), // merge: fills first name only
  /*  3 */ buyer(204, { Email: "mixed.case@example.com" }), // merge, by lower(email)
  /*  4 */ buyer(205, { "Customer ID": "7000000000101", Email: "dana.new@example.com" }), // already imported, by Shopify id
  /*  5 */ buyer(206, { "Customer ID": "", Email: "dana.migrated@example.com" }), // already imported, by email
  /*  6 */ buyer(207, { "Customer ID": "7000000000999", Email: "erin.old@example.com" }), // skip: email already migrated
  /*  7 */ buyer(208, { "Customer ID": "7000000000102", Email: "erin.new@example.com" }), // already imported, by Shopify id
  /*  8 */ buyer(209, { Email: "", Phone: "+6581234567" }), // skip: no email
  /*  9 */ buyer(210, { Email: "not-an-email" }), // skip: invalid email
  /* 10 */ buyer(211, { Email: "twin@example.com" }), // skip: duplicate email, its twin in the next chunk
  /* 11 */ buyer(212, { Email: "TWIN@example.com" }),
  /* 12 */ buyer(213, { "Customer ID": "7000000000300" }), // skip: duplicate Shopify id
  /* 13 */ buyer(214, { "Customer ID": "7000000000300" }),
  /* 14 */ buyer(215, noAddress), // create, no address
  /* 15 */ buyer(216, { "Default Address Zip": "" }), // create, address incomplete
  /* 16 */ buyer(217, { "Customer ID": "" }), // create, email is the key
  /* 17 */ buyer(218, {
    Tags: "neck, vip",
    Note: "Synthetic Shopify note",
    "Default Address City": "Kuala Lumpur",
    "Default Address Country Code": "MY",
    "Default Address Zip": "50450",
  }), // create: tags and note to migrated_customers only, a Malaysian address written as such
];

/** Where the import splits AGREEMENT_EXPORT into two chunks. */
export const AGREEMENT_SPLIT = 11;
