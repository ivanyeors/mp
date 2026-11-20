import { parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/appointments/phone";

type ColumnSpec = {
  readonly header: string;
  readonly aliases?: readonly string[];
  readonly required?: boolean;
};

export const SHOPIFY_COLUMNS = {
  customerId: { header: "Customer ID" },
  email: { header: "Email", required: true },
  firstName: { header: "First Name", required: true },
  lastName: { header: "Last Name", required: true },
  phone: { header: "Phone" },
  acceptsEmailMarketing: { header: "Accepts Email Marketing", required: true },
  totalOrders: { header: "Total Orders", required: true },
  totalSpent: { header: "Total Spent", required: true },
  company: { header: "Default Address Company", aliases: ["Company"] },
  address1: { header: "Default Address Address1", aliases: ["Address1"] },
  address2: { header: "Default Address Address2", aliases: ["Address2"] },
  city: { header: "Default Address City", aliases: ["City"] },
  provinceCode: { header: "Default Address Province Code", aliases: ["Province Code"] },
  countryCode: { header: "Default Address Country Code", aliases: ["Country Code"] },
  zip: { header: "Default Address Zip", aliases: ["Zip"] },
  addressPhone: { header: "Default Address Phone" },
  tags: { header: "Tags" },
  note: { header: "Note" },
} as const satisfies Record<string, ColumnSpec>;

export type ShopifyField = keyof typeof SHOPIFY_COLUMNS;

export const SHOPIFY_FIELDS = Object.keys(SHOPIFY_COLUMNS) as ShopifyField[];

export type ShopifyRawRow = Partial<Record<ShopifyField, string>>;

export type ShopifyHeaderCheck = {
  ok: boolean;
  missing: string[];
  missingOptional: string[];
  dropped: string[];
};

export type ParsedShopifyCsv = { header: ShopifyHeaderCheck; rows: ShopifyRawRow[] };

export function cleanCell(value: string | null | undefined): string {
  return (value ?? "").replace(/^﻿/, "").trim().replace(/^'/, "").trim();
}

const headerKey = (h: string) => cleanCell(h).toLowerCase();

export function parseShopifyCustomersCsv(text: string): ParsedShopifyCsv {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map(cleanCell);
  const keys = header.map((h) => h.toLowerCase());

  const index = new Map<ShopifyField, number>();
  const used = new Set<number>();
  const missing: string[] = [];
  const missingOptional: string[] = [];
  for (const field of SHOPIFY_FIELDS) {
    const spec: ColumnSpec = SHOPIFY_COLUMNS[field];
    const at = [spec.header, ...(spec.aliases ?? [])]
      .map((name) => keys.indexOf(headerKey(name)))
      .find((i) => i >= 0);
    if (at !== undefined) {
      index.set(field, at);
      used.add(at);
    } else if (spec.required) missing.push(spec.header);
    else missingOptional.push(spec.header);
  }
  const dropped = header.filter((h, i) => h !== "" && !used.has(i));

  const rows: ShopifyRawRow[] = table.slice(1).map((cells) => {
    const raw: ShopifyRawRow = {};
    for (const [field, at] of index) {
      const cell = cells[at];
      if (cell !== undefined && cell !== "") raw[field] = cell;
    }
    return raw;
  });

  return { header: { ok: missing.length === 0, missing, missingOptional, dropped }, rows };
}

export type RowInvalidReason = "no_email" | "invalid_email";

export type RowRepair =
  | "zip_repaired"
  | "phone_dropped"
  | "address_incomplete"
  | "total_orders_invalid"
  | "total_spent_invalid";

export type ShopifyAddress = {
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
};

export type NormalisedShopifyRow = {
  shopify_customer_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: ShopifyAddress | null;
  email_marketing_at_export: "yes" | "no";
  shopify_orders_count: number;
  shopify_amount_spent: number;
  shopify_tags: string[];
  shopify_note: string | null;
};

export type NormaliseResult =
  | { ok: true; row: NormalisedShopifyRow; repairs: RowRepair[] }
  | { ok: false; reason: RowInvalidReason };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIGINT_MAX = "9223372036854775807";
const INT_MAX = 2_147_483_647;
const MONEY_LIMIT = 1e10;

const orNull = (s: string) => (s === "" ? null : s);

function parseShopifyId(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const digits = value.replace(/^0+/, "");
  if (digits === "" || digits.length > 19) return null;
  if (digits.length === 19 && digits > BIGINT_MAX) return null;
  return digits;
}

function parseCount(value: string): number | null {
  const s = value.replace(/,/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= INT_MAX ? n : null;
}

function parseMoney(value: string): number | null {
  const s = value.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n < MONEY_LIMIT ? n : null;
}

function splitTags(value: string): string[] {
  const out: string[] = [];
  for (const tag of value.split(",")) {
    const t = tag.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function normaliseAddress(
  raw: ShopifyRawRow,
  names: { first: string | null; last: string | null },
  repairs: Set<RowRepair>,
): ShopifyAddress | null {
  const line1 = cleanCell(raw.address1);
  const line2 = cleanCell(raw.address2);
  const cityCell = cleanCell(raw.city);
  const state = cleanCell(raw.provinceCode);
  const country = cleanCell(raw.countryCode).toUpperCase();
  const zipCell = cleanCell(raw.zip);
  if (![line1, line2, cityCell, state, country, zipCell].some(Boolean)) return null;

  const recipient = [names.first, names.last].filter(Boolean).join(" ") || cleanCell(raw.company);
  const city = cityCell || (country === "SG" ? "Singapore" : "");
  if (!line1 || !zipCell || !/^[A-Z]{2}$/.test(country) || !recipient || !city) {
    repairs.add("address_incomplete");
    return null;
  }

  let postal = zipCell;
  if (country === "SG" && /^\d{5}$/.test(postal)) {
    postal = `0${postal}`;
    repairs.add("zip_repaired");
  }

  const phoneCell = cleanCell(raw.addressPhone);
  const phone = phoneCell ? normalizePhone(phoneCell) : null;
  if (phoneCell && !phone) repairs.add("phone_dropped");

  return { recipient, line1, line2: orNull(line2), city, state: orNull(state), postal_code: postal, country, phone };
}

export function normaliseShopifyRow(raw: ShopifyRawRow): NormaliseResult {
  const email = cleanCell(raw.email).toLowerCase();
  if (!email) return { ok: false, reason: "no_email" };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };

  const repairs = new Set<RowRepair>();
  const first_name = orNull(cleanCell(raw.firstName));
  const last_name = orNull(cleanCell(raw.lastName));

  const phoneCell = cleanCell(raw.phone);
  const phone = phoneCell ? normalizePhone(phoneCell) : null;
  if (phoneCell && !phone) repairs.add("phone_dropped");

  const address = normaliseAddress(raw, { first: first_name, last: last_name }, repairs);

  const orders = parseCount(cleanCell(raw.totalOrders));
  if (orders === null) repairs.add("total_orders_invalid");
  const spent = parseMoney(cleanCell(raw.totalSpent));
  if (spent === null) repairs.add("total_spent_invalid");

  return {
    ok: true,
    row: {
      shopify_customer_id: parseShopifyId(cleanCell(raw.customerId)),
      email,
      first_name,
      last_name,
      phone,
      address,
      email_marketing_at_export: cleanCell(raw.acceptsEmailMarketing).toLowerCase() === "yes" ? "yes" : "no",
      shopify_orders_count: orders ?? 0,
      shopify_amount_spent: spent ?? 0,
      shopify_tags: splitTags(cleanCell(raw.tags)),
      shopify_note: orNull(cleanCell(raw.note)),
    },
    repairs: [...repairs],
  };
}
