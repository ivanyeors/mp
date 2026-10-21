import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Welcome-back voucher's terms (PRD-shopify-customer-migration slice 05
 * stores them, slice 06 edits them; owner decision 2).
 *
 * Six `site_settings` keys, read by `claim_migrated_customer` itself at the
 * moment of each Claim (20261020112100). The SQL is the authority: it issues
 * a voucher only when issuing is on AND the type, the value (for a fixed
 * amount), the valid days and the last issue day are all set and valid, and
 * Singapore's today is on or before that day. `welcomeVoucherIssuing` mirrors
 * that rule so the Discounts card can say, before anyone claims, whether a
 * Claim would issue one and why not.
 *
 * Every value is stored as text. A blank value is "not set", exactly as the
 * SQL reads it (`nullif(btrim(value), '')`).
 */

export const WELCOME_VOUCHER_SETTING_KEYS = [
  "welcome_voucher_enabled",
  "welcome_voucher_type",
  "welcome_voucher_value",
  "welcome_voucher_min_order",
  "welcome_voucher_valid_days",
  "welcome_voucher_issue_until",
] as const;

export type WelcomeVoucherSettingKey = (typeof WELCOME_VOUCHER_SETTING_KEYS)[number];

export const WELCOME_VOUCHER_TYPES = ["fixed_amount", "free_shipping"] as const;
export type WelcomeVoucherType = (typeof WELCOME_VOUCHER_TYPES)[number];

/** The SQL's default when `welcome_voucher_valid_days` is blank. */
export const DEFAULT_VALID_DAYS = 60;
export const MAX_VALID_DAYS = 3650;

export interface WelcomeVoucherTerms {
  /** `welcome_voucher_enabled`; seeded off until the owner decides. */
  enabled: boolean;
  type: WelcomeVoucherType | null;
  /** SGD off, for a fixed amount. */
  value: number | null;
  /** Minimum spend in SGD; null for none. */
  minOrder: number | null;
  /** Days from the Claim until the voucher expires. */
  validDays: number;
  /** YYYY-MM-DD: the last Singapore day a Claim issues a voucher. */
  issueUntil: string | null;
}

export interface ParsedWelcomeVoucherTerms {
  terms: WelcomeVoucherTerms;
  /** Keys whose stored text the SQL would fail to read; while any is listed, nothing is issued. */
  malformed: WelcomeVoucherSettingKey[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD. */
export function isIsoDay(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Singapore's calendar day at `now`, YYYY-MM-DD (UTC+8, no daylight saving). */
export function singaporeDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Pure — the stored rows as the terms, the way the SQL reads them. */
export function parseWelcomeVoucherTerms(stored: Partial<Record<string, string>>): ParsedWelcomeVoucherTerms {
  const malformed: WelcomeVoucherSettingKey[] = [];
  const text = (key: WelcomeVoucherSettingKey) => (stored[key] ?? "").trim();
  const number = (key: WelcomeVoucherSettingKey): number | null => {
    const raw = text(key);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      malformed.push(key);
      return null;
    }
    return n;
  };

  const rawType = text("welcome_voucher_type");
  const type = (WELCOME_VOUCHER_TYPES as readonly string[]).includes(rawType)
    ? (rawType as WelcomeVoucherType)
    : null;

  const days = number("welcome_voucher_valid_days");
  if (days != null && !Number.isInteger(days)) malformed.push("welcome_voucher_valid_days");

  const until = text("welcome_voucher_issue_until");
  if (until && !isIsoDay(until)) malformed.push("welcome_voucher_issue_until");

  return {
    terms: {
      enabled: text("welcome_voucher_enabled").toLowerCase() === "true",
      type,
      value: number("welcome_voucher_value"),
      minOrder: number("welcome_voucher_min_order"),
      validDays: days != null && Number.isInteger(days) ? days : DEFAULT_VALID_DAYS,
      issueUntil: until && isIsoDay(until) ? until : null,
    },
    malformed,
  };
}

/** Pure — the terms as the six stored strings. Blank means not set. */
export function welcomeVoucherTermsToStored(terms: WelcomeVoucherTerms): Record<WelcomeVoucherSettingKey, string> {
  const money = (v: number | null) => (v == null ? "" : String(Math.round(v * 100) / 100));
  return {
    welcome_voucher_enabled: terms.enabled ? "true" : "false",
    welcome_voucher_type: terms.type ?? "",
    welcome_voucher_value: terms.type === "fixed_amount" ? money(terms.value) : "",
    welcome_voucher_min_order: money(terms.minOrder),
    welcome_voucher_valid_days: String(terms.validDays),
    welcome_voucher_issue_until: terms.issueUntil ?? "",
  };
}

export type WelcomeVoucherIssuing =
  | { issuing: true; until: string }
  | {
      issuing: false;
      reason: "off" | "malformed" | "no_type" | "no_value" | "bad_min_order" | "bad_valid_days" | "no_issue_until" | "ended";
    };

/**
 * Whether a Claim made at `now` issues a voucher: the same conditions, in the
 * same order, as `claim_migrated_customer`.
 */
export function welcomeVoucherIssuing(
  { terms, malformed }: ParsedWelcomeVoucherTerms,
  now: Date = new Date(),
): WelcomeVoucherIssuing {
  if (!terms.enabled) return { issuing: false, reason: "off" };
  if (malformed.length > 0) return { issuing: false, reason: "malformed" };
  if (!terms.type) return { issuing: false, reason: "no_type" };
  if (terms.type === "fixed_amount" && !(terms.value != null && terms.value > 0)) {
    return { issuing: false, reason: "no_value" };
  }
  if (terms.minOrder != null && terms.minOrder < 0) return { issuing: false, reason: "bad_min_order" };
  if (terms.validDays < 1 || terms.validDays > MAX_VALID_DAYS) return { issuing: false, reason: "bad_valid_days" };
  if (!terms.issueUntil) return { issuing: false, reason: "no_issue_until" };
  if (singaporeDay(now) > terms.issueUntil) return { issuing: false, reason: "ended" };
  return { issuing: true, until: terms.issueUntil };
}

/**
 * What the Discounts card saves: the whole set of terms. Turning issuing on
 * needs complete terms, so the switch can never read "on" while every Claim
 * silently issues nothing. A last issue day in the past is allowed (the card
 * says issuing has ended), so a lapsed campaign can still be edited.
 */
export const welcomeVoucherTermsSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(WELCOME_VOUCHER_TYPES).nullable(),
    value: z.number().positive().max(100_000).nullable(),
    minOrder: z.number().min(0).max(1_000_000).nullable(),
    validDays: z.number().int().min(1).max(MAX_VALID_DAYS),
    issueUntil: z.string().refine(isIsoDay, "Use a real date, YYYY-MM-DD.").nullable(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (!t.enabled) return;
    if (!t.type) ctx.addIssue({ code: "custom", path: ["type"], message: "Choose a voucher type before turning issuing on." });
    if (t.type === "fixed_amount" && t.value == null) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Set the voucher's value before turning issuing on." });
    }
    if (!t.issueUntil) {
      ctx.addIssue({ code: "custom", path: ["issueUntil"], message: "Set the last day to issue before turning issuing on." });
    }
  });

/**
 * The stored terms. Throws on a failed read, so the card never shows "off"
 * for terms it could not read, and a save never overwrites them blind.
 */
export async function readWelcomeVoucherTerms(admin: SupabaseClient): Promise<ParsedWelcomeVoucherTerms> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...WELCOME_VOUCHER_SETTING_KEYS]);
  if (error) throw new Error(error.message);
  const stored: Record<string, string> = {};
  for (const row of (data ?? []) as { key: string; value: string | null }[]) stored[row.key] = row.value ?? "";
  return parseWelcomeVoucherTerms(stored);
}
