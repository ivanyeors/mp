/**
 * Commission calc + lifecycle (#77, ADR 0015). PURE — no I/O, no supabaseAdmin —
 * so the money math is unit-testable in isolation (slice #85). DB reads/writes
 * live in ./ledger, which imports this module.
 *
 * Money rules:
 *  - base = per-UNIT base price of pillow/bolster lines only. Add-ons (folded into
 *    the order_item unit_price), shipping and tax are excluded by the caller before
 *    it ever reaches here.
 *  - release is dated from delivery (delivered_at + return window), NEVER paid_at.
 */

import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";

export type CommissionProductType = "pillow" | "bolster";
export type SchemeKind = "flat" | "percent";
export type CommissionStatus = "held" | "released" | "void" | "paid";

export interface CommissionScheme {
  /** null = the DEFAULT scheme; a uuid = a per-partner override. */
  partner_id: string | null;
  product_type: CommissionProductType;
  kind: SchemeKind;
  amount: number;
}

/** Commission releases exactly when the RMA return window closes — same window. */
export const COMMISSION_RELEASE_WINDOW_DAYS = DEFAULT_RETURN_WINDOW_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Round to cents; money never carries float dust. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the scheme for (partner, productType): a per-partner OVERRIDE wins,
 * else the DEFAULT (null partner). Returns null when neither exists.
 */
export function resolveScheme(
  schemes: CommissionScheme[],
  partnerId: string,
  productType: CommissionProductType,
): CommissionScheme | null {
  const forType = schemes.filter((s) => s.product_type === productType);
  return (
    forType.find((s) => s.partner_id === partnerId) ??
    forType.find((s) => s.partner_id === null) ??
    null
  );
}

/**
 * Per-line commission. `baseAmount` is the per-line base (per-unit base × quantity),
 * already stripped of add-ons/shipping/tax. `percent` → % of the line base; `flat`
 * → a flat amount per UNIT, times quantity.
 */
export function computeCommission(
  baseAmount: number,
  quantity: number,
  scheme: CommissionScheme,
): number {
  if (scheme.kind === "percent") return round2((baseAmount * scheme.amount) / 100);
  return round2(scheme.amount * quantity);
}

/** release_at = delivered_at + window; null while the order is not yet delivered. */
export function releaseAt(
  deliveredAt: string | null | undefined,
  windowDays: number = COMMISSION_RELEASE_WINDOW_DAYS,
): Date | null {
  if (!deliveredAt) return null;
  return new Date(new Date(deliveredAt).getTime() + windowDays * DAY_MS);
}

/**
 * Derive-on-read status. `void`/`paid`/`released` stick (paid is terminal, like
 * void); a `held` row is effectively released once now >= delivered_at + window.
 * `delivered_at` is the ORDER's delivery date, so release is always dated from
 * delivery — never paid_at.
 */
export function effectiveCommissionStatus(
  row: { status: CommissionStatus; delivered_at: string | null },
  now: Date,
  windowDays: number = COMMISSION_RELEASE_WINDOW_DAYS,
): CommissionStatus {
  if (row.status === "void") return "void";
  if (row.status === "paid") return "paid";
  if (row.status === "released") return "released";
  const ra = releaseAt(row.delivered_at, windowDays);
  if (ra && now.getTime() >= ra.getTime()) return "released";
  return "held";
}
