import { toCsv } from "@/lib/csv";

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
  seed(1, {
    email: "kim.account@example.com",
    first_name: "Kim",
    has_account: true,
    tags: ["platform-tag"],
    notes: "Platform staff note",
    total_orders: 3,
    total_spent: 450,
  }),
  seed(2, {
    email: "lee.noaccount@example.com",
    last_name: "Lee",
    phone: "+6590000002",
    address: { recipient: "Lee", line1: "2 Platform Road", city: "Singapore", postal_code: "238802", country: "SG" },
  }),
  seed(3, { email: "Mixed.Case@Example.com", first_name: "Max", last_name: "Case" }),
  seed(4, { email: "dana.migrated@example.com", first_name: "Dana", migrated: "7000000000101" }),
  seed(5, { email: "erin.old@example.com", first_name: "Erin", migrated: "7000000000102" }),
];

const noAddress: ExportRow = {
  "Default Address Address1": "",
  "Default Address City": "",
  "Default Address Country Code": "",
  "Default Address Zip": "",
};

export const AGREEMENT_EXPORT: ExportRow[] = [
  buyer(201, { "Default Address Zip": "18956" }),
  buyer(202, { Email: "Kim.Account@example.com", "First Name": "Kimberly", "Last Name": "Tan", Phone: "+6590000001" }),
  buyer(203, { Email: "lee.noaccount@example.com", "First Name": "Lee", "Last Name": "Other" }),
  buyer(204, { Email: "mixed.case@example.com" }),
  buyer(205, { "Customer ID": "7000000000101", Email: "dana.new@example.com" }),
  buyer(206, { "Customer ID": "", Email: "dana.migrated@example.com" }),
  buyer(207, { "Customer ID": "7000000000999", Email: "erin.old@example.com" }),
  buyer(208, { "Customer ID": "7000000000102", Email: "erin.new@example.com" }),
  buyer(209, { Email: "", Phone: "+6581234567" }),
  buyer(210, { Email: "not-an-email" }),
  buyer(211, { Email: "twin@example.com" }),
  buyer(212, { Email: "TWIN@example.com" }),
  buyer(213, { "Customer ID": "7000000000300" }),
  buyer(214, { "Customer ID": "7000000000300" }),
  buyer(215, noAddress),
  buyer(216, { "Default Address Zip": "" }),
  buyer(217, { "Customer ID": "" }),
  buyer(218, {
    Tags: "neck, vip",
    Note: "Synthetic Shopify note",
    "Default Address City": "Kuala Lumpur",
    "Default Address Country Code": "MY",
    "Default Address Zip": "50450",
  }),
];

export const AGREEMENT_SPLIT = 11;
