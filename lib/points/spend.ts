/**
 * Spending points at shop checkout (PRD-loyalty-points slice 04; ADR 0030
 * (h) to (l); 20261021140000_points_spending.sql).
 *
 * The rules are pure so checkout, the preview route and the tests share one
 * reading of them. The reservation itself is SQL: `reserve_points` takes the
 * per-Customer lock and re-reads the balance, so two tabs can never spend one
 * balance twice. These wrappers never throw: a points failure is answered in
 * words, never a 500 from deep inside checkout or the webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POINTS_PER_DOLLAR, formatDollars, formatPoints, pointsToDollars } from "./value";

/** The fixed copy beside the checkout control (stories 5 and 9). */
export const POINTS_CHECKOUT_COPY = "Points can't be used on custom pillows. Points used are not refunded.";

/** Rule (h): a guest, someone else's account, or the owner under another email. */
export const POINTS_ACCOUNT_ERROR = "Sign in with your account email to use points.";

/** Rule (r), at checkout. */
export const POINTS_PARTNER_ERROR = "Partners can't use points.";

export const POINTS_DISABLED_ERROR = "Points can't be used right now.";

/** The Stripe coupon's name: "CODE + Points", or "Points" alone. */
export function withPointsLabel(label: string | null): string {
  return label ? `${label} + Points` : "Points";
}

/**
 * What the allowance is worked out from. `productsAfterCoupon` is the
 * subtotal less every other discount: the coupon, and partner pricing (which
 * a partner can never combine with points).
 */
export interface AllowanceInput {
  /** The available balance, in points. */
  available: number;
  productsAfterCoupon: number;
  minRedeem: number;
  /** 0 to 1. */
  maxShare: number;
}

/**
 * Pure — the most, in whole dollars, rule (i) lets points take off: the
 * share of the products' price after any coupon, floored, and never all of it,
 * so every Order still takes some cash. Shipping is never in it.
 */
export function pointsCapDollars(productsAfterCoupon: number, maxShare: number): number {
  const cents = Math.max(0, Math.round(productsAfterCoupon * 100));
  if (cents === 0 || !(maxShare > 0)) return 0;
  // In cents, with a nudge for binary drift: 0.29 × 10000 is 2899.9999….
  const shareDollars = Math.floor(Math.floor(Math.min(maxShare, 1) * cents + 1e-6) / 100);
  const belowWhole = Math.ceil(cents / 100) - 1;
  return Math.max(0, Math.min(shareDollars, belowWhole));
}

/**
 * Pure — the most points this order allows, in 100-point (S$1) steps: no more
 * than the balance and no more than the cap. Null when that is below the
 * minimum, so the order cannot take points at all.
 */
export function pointsAllowance(i: AllowanceInput): number | null {
  const balanceSteps = Math.floor(Math.max(0, i.available) / POINTS_PER_DOLLAR) * POINTS_PER_DOLLAR;
  const max = Math.min(balanceSteps, pointsCapDollars(i.productsAfterCoupon, i.maxShare) * POINTS_PER_DOLLAR);
  if (max <= 0 || max < i.minRedeem) return null;
  return max;
}

export type PointsRequestCheck = { ok: true; points: number; discount: number } | { ok: false; error: string };

/**
 * Pure — the server's check of the points a checkout asks for (rule i). The
 * page offers only valid amounts, so each refusal is a forged or stale
 * request: an odd step, below the minimum, above the cap, or above the
 * balance.
 */
export function validatePointsRequest(requested: unknown, i: AllowanceInput): PointsRequestCheck {
  const n = typeof requested === "number" ? requested : Number.NaN;
  if (!Number.isInteger(n) || n <= 0 || n % POINTS_PER_DOLLAR !== 0) {
    return { ok: false, error: "Points are used in steps of 100 (S$1)." };
  }
  if (n < i.minRedeem) {
    return { ok: false, error: `Use at least ${formatPoints(i.minRedeem)}.` };
  }
  const cap = pointsCapDollars(i.productsAfterCoupon, i.maxShare) * POINTS_PER_DOLLAR;
  if (n > cap) {
    return {
      ok: false,
      error: cap > 0 ? `This order can take at most ${formatPoints(cap)}.` : "This order is too small to use points.",
    };
  }
  if (n > i.available) {
    return { ok: false, error: `You have ${formatPoints(Math.max(0, i.available))} to use.` };
  }
  return { ok: true, points: n, discount: pointsToDollars(n) };
}

/**
 * Pure — whether this checkout may use value held by `ownerCustomerId`'s
 * account (rule h): the signed-in Customer is the owner, and the checkout
 * email resolves to that same Customer, so the Order and the value stay on
 * one row. A guest never may, and value with no owner is nothing to use.
 * Coupons are bearer codes and bind to no account (ADR 0030, decision 14), so
 * this is the platform's one account-binding rule.
 */
export function mayUseAccountValue(
  ownerCustomerId: string | null | undefined,
  holder: { sessionCustomerId: string | null; emailCustomerId: string | null },
): boolean {
  if (!ownerCustomerId) return false;
  return holder.sessionCustomerId === ownerCustomerId && holder.emailCustomerId === ownerCustomerId;
}

// ---------------------------------------------------------------------------
// The reservation (SQL)
// ---------------------------------------------------------------------------

export const RESERVE_OUTCOMES = [
  "reserved",
  "customer",
  "disabled",
  "partner",
  "step",
  "minimum",
  "order",
  "cap",
  "insufficient",
] as const;
export type ReserveOutcome = (typeof RESERVE_OUTCOMES)[number] | "error";

/** What checkout tells the customer when the reservation is refused. */
export function reserveRefusalMessage(outcome: Exclude<ReserveOutcome, "reserved">): string {
  switch (outcome) {
    case "insufficient":
      return "Your points balance has changed. Please check the points you're using and try again.";
    case "partner":
      return POINTS_PARTNER_ERROR;
    case "disabled":
      return POINTS_DISABLED_ERROR;
    case "customer":
      return POINTS_ACCOUNT_ERROR;
    case "step":
      return "Points are used in steps of 100 (S$1).";
    case "minimum":
    case "cap":
      return "That many points can't be used on this order. Please check the amount and try again.";
    case "order":
    case "error":
      return "We couldn't apply your points. Please try again.";
  }
}

/**
 * Reserves `points` from the Customer's balance for a pending Order (rule j).
 * Never throws: a failed call is `error`.
 */
export async function reservePoints(
  admin: SupabaseClient,
  p: { customerId: string; orderId: string; points: number },
): Promise<ReserveOutcome> {
  try {
    const { data, error } = await admin.rpc("reserve_points", {
      p_customer_id: p.customerId,
      p_order_id: p.orderId,
      p_points: p.points,
    });
    if (error) {
      console.error(`[points] reserve_points failed for order ${p.orderId}:`, error.message);
      return "error";
    }
    return (RESERVE_OUTCOMES as readonly string[]).includes(String(data)) ? (data as ReserveOutcome) : "error";
  } catch (e) {
    console.error(`[points] reserve_points failed for order ${p.orderId}:`, e);
    return "error";
  }
}

export type ReleaseResult = { ok: true; released: boolean } | { ok: false; error: string };

/**
 * Gives an unpaid Order's reservation back (the Checkout expired, its payment
 * failed, or Stripe refused to open it). `released` is false when there was
 * nothing to give back: no reservation, already released, or the Order was
 * paid. Never throws.
 */
export async function releasePoints(admin: SupabaseClient, orderId: string): Promise<ReleaseResult> {
  try {
    const { data, error } = await admin.rpc("release_points", { p_order_id: orderId });
    if (error) {
      console.error(`[points] release_points failed for order ${orderId}:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, released: data === true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[points] release_points failed for order ${orderId}:`, message);
    return { ok: false, error: message };
  }
}

export type SweepResult = { ok: true; released: number } | { ok: false; error: string };

/**
 * The daily sweep: gives back every reservation whose Order was cancelled or
 * failed, or is still pending 48 hours after it was created, and has no
 * release yet. Safe to re-run. Never throws.
 */
export async function releaseStalePointReservations(admin: SupabaseClient, now: Date = new Date()): Promise<SweepResult> {
  try {
    const { data, error } = await admin.rpc("release_stale_point_reservations", { p_now: now.toISOString() });
    if (error) return { ok: false, error: `Could not release stale point reservations: ${error.message}` };
    const n = Number(data);
    return { ok: true, released: Number.isFinite(n) ? n : 0 };
  } catch (e) {
    return { ok: false, error: `Could not release stale point reservations: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** "Points used: 2,000 (−S$20.00)": the Order's own line, apart from the coupon. */
export function formatPointsUsed(points: number): string {
  return `Points used: ${Math.round(points).toLocaleString("en-SG")} (${formatDollars(-pointsToDollars(points))})`;
}
