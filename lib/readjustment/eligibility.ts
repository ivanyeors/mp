/**
 * Complimentary re-adjustment (ADR 0024). Pure function over data only — the
 * picker badge, the free-booking route and the paid-checkout route share exactly
 * one rule, and the server never trusts the client's belief that a visit is free.
 *
 * Premium Mpillow only: `freeVisits` per unit while the booking date is within
 * `freeWindowDays` of the purchase (`orders.paid_at`), counted in Singapore
 * calendar days with the purchase day as day 0. Everything else pays the fee.
 */

import type { ReadjustmentPolicy } from "@/lib/pricing/service-prices";

export type ReadjustablePurchase = {
  source: "platform" | "unlisted";
  orderItemId: string | null;
  productType: "pillow" | "bolster";
  tier: "basic" | "premium" | null;
  /** `orders.paid_at` (ISO). */
  paidAt: string | null;
  /** quantity − returned_quantity: each unit earns its own free visits. */
  units: number;
};

export type ReadjustmentQuote =
  | {
      complimentary: true;
      fee: 0;
      /** The free-visit sequence number a booking claims (1-based). */
      seq: number;
      /** Last day (YYYY-MM-DD, SGT) a complimentary visit can be booked. */
      freeUntil: string;
    }
  | {
      complimentary: false;
      fee: number;
      reason: "unlisted" | "not_premium" | "no_free_visits" | "window_ended" | "free_visit_used";
      /** The day the free window closed (YYYY-MM-DD, SGT), for `window_ended`. */
      windowEndedOn?: string;
    };

const SGT = "Asia/Singapore";

/** A moment as its Singapore calendar day, YYYY-MM-DD. */
export function sgtDate(at: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);
}

/** YYYY-MM-DD plus n calendar days (no time zone involved — pure date arithmetic). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function evaluateReadjustment(
  purchase: ReadjustablePurchase,
  /** complimentary_seq of this line's bookings that are booked, attended or a no-show. */
  usedSeqs: readonly number[],
  policy: ReadjustmentPolicy,
  fee: number,
  /** Booking day, YYYY-MM-DD in Singapore. */
  today: string,
): ReadjustmentQuote {
  if (purchase.source !== "platform" || !purchase.orderItemId) {
    return { complimentary: false, fee, reason: "unlisted" };
  }
  if (purchase.productType !== "pillow" || purchase.tier !== "premium" || !purchase.paidAt) {
    return { complimentary: false, fee, reason: "not_premium" };
  }
  const allowed = Math.max(0, policy.freeVisits) * Math.max(0, purchase.units);
  if (allowed === 0) {
    return { complimentary: false, fee, reason: "no_free_visits" };
  }
  const freeUntil = addDays(sgtDate(purchase.paidAt), policy.freeWindowDays);
  if (today > freeUntil) {
    return { complimentary: false, fee, reason: "window_ended", windowEndedOn: freeUntil };
  }
  const used = new Set(usedSeqs);
  for (let seq = 1; seq <= allowed; seq++) {
    if (!used.has(seq)) return { complimentary: true, fee: 0, seq, freeUntil };
  }
  return { complimentary: false, fee, reason: "free_visit_used" };
}
