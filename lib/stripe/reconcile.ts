/**
 * Post-payment reconciliation between a completed Stripe Checkout Session and
 * our persisted order. Stripe is the authority on what the customer actually
 * paid (and, when Stripe Tax is on, on the tax), so on completion we:
 *
 *  1. verify the pre-tax amount Stripe charged (subtotal − discount + shipping)
 *     matches what we computed, and
 *  2. write the session's tax and grand total back onto the order.
 *
 * The arithmetic is pure and dependency-free so it can be unit-tested over
 * raw numbers; the webhook supplies the live session/order.
 */

export interface ReconcilableOrder {
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  /** Pre-checkout tax estimate; used only when Stripe Tax is off (amountTax 0). */
  tax_amount: number | null;
}

export interface SessionTotals {
  /** Grand total Stripe charged, in major units (e.g. dollars). */
  amountTotal: number;
  /** Tax Stripe computed (0 when Stripe Tax is disabled), in major units. */
  amountTax: number;
}

export interface ReconcileResult {
  /** True when the pre-tax amount we computed matches what Stripe charged. */
  ok: boolean;
  expectedTotal: number;
  sessionTotal: number;
  /** Difference (session − expected); 0 when reconciled. */
  delta: number;
  /** Authoritative values to persist on the order. */
  writeBack: { tax_amount: number; total: number };
}

/** Round to 2 decimal places (currency), avoiding binary float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Extract the totals we care about from a Stripe Checkout Session. */
export function sessionTotals(session: {
  amount_total?: number | null;
  total_details?: { amount_tax?: number | null } | null;
}): SessionTotals {
  return {
    amountTotal: (session.amount_total ?? 0) / 100,
    amountTax: (session.total_details?.amount_tax ?? 0) / 100,
  };
}

/**
 * Reconcile a completed session against an order.
 *
 * The pre-tax portion (subtotal − discount + shipping) is OUR responsibility
 * and must match what Stripe charged before tax; tax itself is Stripe's
 * authority when Stripe Tax is enabled (`amountTax > 0`), otherwise it stays
 * the pre-checkout estimate (manual tax mode, where tax is a line item and
 * `amountTax` is 0). A mismatch means a discount/shipping/price leak and must
 * be flagged, never silently confirmed.
 */
export function reconcileOrderTotal(
  order: ReconcilableOrder,
  totals: SessionTotals,
  tolerance = 0.01
): ReconcileResult {
  const preTax = round2(order.subtotal - order.discount_amount + order.shipping_amount);
  const tax = totals.amountTax > 0 ? totals.amountTax : order.tax_amount ?? 0;
  const expectedTotal = round2(preTax + tax);
  const sessionTotal = round2(totals.amountTotal);
  const delta = round2(sessionTotal - expectedTotal);

  return {
    ok: Math.abs(delta) <= tolerance,
    expectedTotal,
    sessionTotal,
    delta,
    writeBack: { tax_amount: round2(tax), total: sessionTotal },
  };
}
