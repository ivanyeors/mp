/**
 * Partner self-purchase discount/cap math (#82). PURE — no I/O, no supabaseAdmin —
 * so the money math is unit-testable in isolation (slice #85). DB reads live in
 * ./allowance, which imports this module.
 *
 * A signed-in partner buying pillows/bolsters in their OWN account gets their
 * admin-set rate (percent of MSRP, or flat $ off per unit), applied to the first
 * N commissionable units where N = remaining cap (unit_cap − already-consumed).
 * Over-cap units keep MSRP. The order stays UNATTRIBUTED (partner_id null), so no
 * commission/milestone is earned.
 */

export type SelfPurchaseKind = "flat" | "percent";

export interface SelfPurchaseRate {
  /** null = no rate set (feature off for this partner). */
  kind: SelfPurchaseKind | null;
  /** percent (0-100) when kind='percent', or flat $ off per unit when kind='flat'. */
  amount: number;
  /** max discounted units EVER (across all self-purchases). */
  unitCap: number;
  /** discounted units already consumed on prior paid self-purchase orders. */
  unitsUsed: number;
}

/** One commissionable (pillow/bolster) order line: per-unit MSRP basis + quantity. */
export interface CommissionableLine {
  /** variant.price + per-unit add-on price. */
  unitPrice: number;
  quantity: number;
}

export interface SelfPurchaseDiscount {
  /** total $ off across the order (rounded to cents). */
  discountAmount: number;
  /** units that received the discount — persist to increment consumed allowance. */
  discountedUnits: number;
}

/** Round to cents; money never carries float dust. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Discounted units still available = cap − consumed, floored at 0. */
export function remainingSelfPurchaseUnits(rate: Pick<SelfPurchaseRate, "unitCap" | "unitsUsed">): number {
  return Math.max(0, rate.unitCap - rate.unitsUsed);
}

/**
 * Discount for a self-purchase: apply the rate to the first `remaining` cap units
 * across the commissionable lines (in the order given), leaving over-cap units at
 * MSRP. Percent → % of unit price; flat → $ off per unit, never below zero. Returns
 * zero when the feature is off (no kind / amount ≤ 0) or the cap is exhausted.
 */
export function computeSelfPurchaseDiscount(
  rate: SelfPurchaseRate,
  lines: CommissionableLine[],
): SelfPurchaseDiscount {
  const remaining = remainingSelfPurchaseUnits(rate);
  if (!rate.kind || rate.amount <= 0 || remaining <= 0) {
    return { discountAmount: 0, discountedUnits: 0 };
  }

  let unitsLeft = remaining;
  let discountAmount = 0;
  let discountedUnits = 0;
  for (const line of lines) {
    if (unitsLeft <= 0) break;
    const units = Math.min(line.quantity, unitsLeft);
    const perUnitOff =
      rate.kind === "percent"
        ? (line.unitPrice * rate.amount) / 100
        : Math.min(rate.amount, line.unitPrice); // flat never exceeds the unit price
    discountAmount += perUnitOff * units;
    discountedUnits += units;
    unitsLeft -= units;
  }
  return { discountAmount: round2(discountAmount), discountedUnits };
}
