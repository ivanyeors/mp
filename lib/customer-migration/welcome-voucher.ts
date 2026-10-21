/**
 * The Welcome-back voucher as people see it (PRD-shopify-customer-migration
 * slice 06): the voucher card on the welcome page and on the Profile, its
 * state in the Admin Panel, and what the vouchers cost on the Discounts page.
 *
 * The voucher is the `coupons` row the Claim issues (`issued_for =
 * 'welcome_back'`, slice 05). `coupons` is service-role only, so every read
 * here uses the service role, keyed by the Customer the session resolved to
 * (`linkCustomerToAuthUser`), never by an id from a request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSgDate } from "@/lib/email/format";
import { formatCurrency } from "@/lib/i18n/currencies";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/types/ecommerce";

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * `none` (no voucher), `issued` (unused, still usable), `used` (redeemed) or
 * `expired` (unused, past its expiry or switched off in Discounts).
 */
export const WELCOME_VOUCHER_STATES = ["none", "issued", "used", "expired"] as const;
export type WelcomeVoucherState = (typeof WELCOME_VOUCHER_STATES)[number];

export type WelcomeVoucherRow = Pick<
  Coupon,
  | "code"
  | "discount_type"
  | "discount_value"
  | "currency"
  | "min_order_amount"
  | "expires_at"
  | "usage_count"
  | "is_active"
>;

/**
 * The voucher's state. The same rule as `welcome_voucher_state()` in SQL
 * (20261020121100), which the Admin Panel reads through the Customer overview;
 * the slice 06 SQL assert checks the two agree.
 */
export function welcomeVoucherState(
  voucher: Pick<WelcomeVoucherRow, "usage_count" | "is_active" | "expires_at"> | null,
  now: Date = new Date(),
): WelcomeVoucherState {
  if (!voucher) return "none";
  if (Number(voucher.usage_count) > 0) return "used";
  if (!voucher.is_active) return "expired";
  if (voucher.expires_at && Date.parse(voucher.expires_at) <= now.getTime()) return "expired";
  return "issued";
}

const VOUCHER_SELECT =
  "code, discount_type, discount_value, currency, min_order_amount, expires_at, usage_count, is_active";

/**
 * The Customer's Welcome-back voucher, or null for none. A failed read is null
 * too: the card is a convenience and never breaks the page it sits on.
 */
export async function readWelcomeVoucher(
  admin: SupabaseClient,
  customerId: string,
): Promise<WelcomeVoucherRow | null> {
  try {
    const { data, error } = await admin
      .from("coupons")
      .select(VOUCHER_SELECT)
      .eq("customer_id", customerId)
      .eq("issued_for", "welcome_back")
      .maybeSingle();
    if (error) {
      console.error(`[welcome-voucher] read failed for ${customerId}:`, error.message);
      return null;
    }
    return (data as WelcomeVoucherRow | null) ?? null;
  } catch (err) {
    console.error(`[welcome-voucher] read threw for ${customerId}:`, err);
    return null;
  }
}

// ─── The voucher card ────────────────────────────────────────────────────────

/** What the voucher card shows, already formatted. */
export interface WelcomeVoucherCardData {
  code: string;
  /** "S$20.00 off", "Free shipping" or "10% off". */
  worth: string;
  /** The minimum spend, or null for none. */
  minimum: string | null;
  /** Singapore calendar day, e.g. "19 December 2026"; null for no expiry. */
  expiresOn: string | null;
}

/** Pure — the card's text for a voucher. */
export function welcomeVoucherCard(voucher: WelcomeVoucherRow): WelcomeVoucherCardData {
  const value = Number(voucher.discount_value);
  const worth =
    voucher.discount_type === "free_shipping"
      ? "Free shipping"
      : voucher.discount_type === "percentage"
        ? `${value}% off`
        : `${formatCurrency(value, voucher.currency)} off`;
  const min = voucher.min_order_amount == null ? 0 : Number(voucher.min_order_amount);
  return {
    code: voucher.code,
    worth,
    minimum: min > 0 ? formatCurrency(min, voucher.currency) : null,
    expiresOn: voucher.expires_at ? formatSgDate(voucher.expires_at) : null,
  };
}

/**
 * The card to show a signed-in Customer, or null: only while their voucher is
 * unused and unexpired.
 */
export function usableWelcomeVoucherCard(
  voucher: WelcomeVoucherRow | null,
  now: Date = new Date(),
): WelcomeVoucherCardData | null {
  return voucher && welcomeVoucherState(voucher, now) === "issued" ? welcomeVoucherCard(voucher) : null;
}

// ─── What the vouchers cost (the Discounts page) ─────────────────────────────

/** Every column of `admin_welcome_voucher_summary`, in the view's order. */
export const WELCOME_VOUCHER_SUMMARY_COLUMNS = [
  "issued",
  "redeemed",
  "outstanding",
  "expired",
  "free_shipping",
  "value_issued",
  "value_outstanding",
  "value_redeemed",
] as const;

export interface WelcomeVoucherSummary {
  issued: number;
  redeemed: number;
  /** Issued, unused and still usable. */
  outstanding: number;
  expired: number;
  /** Free-shipping vouchers: counted, never valued. */
  freeShipping: number;
  /** Every fixed-amount voucher at face value. */
  valueIssued: number;
  /** The live liability: outstanding × value. */
  valueOutstanding: number;
  /** The realised cost: redeemed × value. */
  valueRedeemed: number;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The view's one row. Counts may arrive as strings (bigint), sums as numeric strings. */
export function welcomeVoucherSummaryFromRow(
  row: Partial<Record<(typeof WELCOME_VOUCHER_SUMMARY_COLUMNS)[number], unknown>> | null,
): WelcomeVoucherSummary {
  return {
    issued: num(row?.issued),
    redeemed: num(row?.redeemed),
    outstanding: num(row?.outstanding),
    expired: num(row?.expired),
    freeShipping: num(row?.free_shipping),
    valueIssued: num(row?.value_issued),
    valueOutstanding: num(row?.value_outstanding),
    valueRedeemed: num(row?.value_redeemed),
  };
}

/** The Discounts card's figures, or null when they could not be read. The caller has checked `discounts`. */
export async function getWelcomeVoucherSummary(
  admin: SupabaseClient = supabaseAdmin(),
): Promise<WelcomeVoucherSummary | null> {
  try {
    const { data, error } = await admin
      .from("admin_welcome_voucher_summary")
      .select(WELCOME_VOUCHER_SUMMARY_COLUMNS.join(", "))
      .maybeSingle();
    if (error) return null;
    return welcomeVoucherSummaryFromRow(data as Record<string, unknown> | null);
  } catch {
    return null;
  }
}
