/**
 * Every imported customer starts subscribed (owner, 2026-10-31; ADR 0039).
 * Pure: the Import page reads Shopify's unsubscribed list in the browser, and
 * `subscribe_migrated_customers()` (20261031144524) does the rest in one
 * transaction.
 *
 * Shopify's export says only yes or no to email marketing, and its "no" covers
 * both people nobody asked and people who unsubscribed. So the owner exports
 * the second group too (Customers → filter "Email subscription status:
 * Unsubscribed" → Export), and those people stay unsubscribed. Without the
 * list, or the owner's word that it is empty, nothing is subscribed.
 */
import { parseCsv } from "@/lib/csv";
import { cleanCell } from "./shopify-csv";

/** More rows than any Shopify store this platform imports. */
export const MAX_UNSUBSCRIBED_LIST = 50_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmail = (value: string) => value.length <= 254 && EMAIL_RE.test(value);

export type UnsubscribedListRead =
  | { ok: true; emails: string[]; rows: number; skipped: number }
  | { ok: false; error: string };

/**
 * Shopify's unsubscribed list, from its CSV export: every distinct email,
 * lower-cased. Any CSV with an Email column reads; a row with no usable email
 * is counted, not sent.
 */
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

/** The server's own reading of the list the browser sends. */
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

/** `subscribe_migrated_customers()`'s answer. */
export type DefaultConsentCounts = {
  /** Migrated customers. */
  imported: number;
  /** Of them, subscribed already and not on the list. */
  alreadySubscribed: number;
  /** Of them, nobody has asked and not on the list: the default subscribes these. */
  toSubscribe: number;
  /** Of them, unsubscribed here already. They stay so. */
  stayUnsubscribed: number;
  /** Distinct emails on Shopify's list. */
  listed: number;
  /** Customers with one of those emails. */
  listedCustomers: number;
  /** Of those, unsubscribed by the list (not already, and not by their own choice here since). */
  toUnsubscribe: number;
  /** After a run: what changed. */
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
