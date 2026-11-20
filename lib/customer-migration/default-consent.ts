import { parseCsv } from "@/lib/csv";
import { cleanCell } from "./shopify-csv";

export const MAX_UNSUBSCRIBED_LIST = 50_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmail = (value: string) => value.length <= 254 && EMAIL_RE.test(value);

export type UnsubscribedListRead =
  | { ok: true; emails: string[]; rows: number; skipped: number }
  | { ok: false; error: string };

export function readUnsubscribedList(text: string): UnsubscribedListRead {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => cleanCell(h).toLowerCase());
  const at = header.indexOf("email");
  if (at < 0) return { ok: false, error: "This file has no Email column. Export it again from Shopify as a Plain CSV file." };

  const rows = table.slice(1).filter((cells) => cells.some((c) => c.trim() !== ""));
  if (rows.length > MAX_UNSUBSCRIBED_LIST) {
    return { ok: false, error: `This file has over ${MAX_UNSUBSCRIBED_LIST.toLocaleString("en-SG")} rows.` };
  }
  const emails = new Set<string>();
  let skipped = 0;
  for (const cells of rows) {
    const email = cleanCell(cells[at]).toLowerCase();
    if (isEmail(email)) emails.add(email);
    else skipped += 1;
  }
  return { ok: true, emails: [...emails], rows: rows.length, skipped };
}

export function readEmailList(input: unknown): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length > MAX_UNSUBSCRIBED_LIST) {
    return { ok: false, error: "Pick Shopify's unsubscribed list again." };
  }
  const emails = new Set<string>();
  for (const value of input) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!isEmail(email)) return { ok: false, error: "Pick Shopify's unsubscribed list again." };
    emails.add(email);
  }
  return { ok: true, emails: [...emails] };
}

export type DefaultConsentCounts = {
  imported: number;
  alreadySubscribed: number;
  toSubscribe: number;
  stayUnsubscribed: number;
  listed: number;
  listedCustomers: number;
  toUnsubscribe: number;
  subscribed?: number;
  unsubscribed?: number;
};

const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

export function readDefaultConsentCounts(data: unknown): DefaultConsentCounts | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const fields = {
    imported: count(d.imported),
    alreadySubscribed: count(d.already_subscribed),
    toSubscribe: count(d.to_subscribe),
    stayUnsubscribed: count(d.stay_unsubscribed),
    listed: count(d.listed),
    listedCustomers: count(d.listed_customers),
    toUnsubscribe: count(d.to_unsubscribe),
  };
  if (Object.values(fields).some((v) => v === null)) return null;
  const counts = fields as Omit<DefaultConsentCounts, "subscribed" | "unsubscribed">;
  const subscribed = count(d.subscribed);
  const unsubscribed = count(d.unsubscribed);
  return {
    ...counts,
    ...(subscribed !== null ? { subscribed } : {}),
    ...(unsubscribed !== null ? { unsubscribed } : {}),
  };
}
