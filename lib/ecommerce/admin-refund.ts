const UNPAID_STATUSES = new Set(["pending", "payment_failed", "cancelled"]);

/**
 * What can still be refunded. Ceiling is what we actually CAPTURED, not the order
 * total: a Result order whose final price outgrew the authorization hold is paid by
 * two intents, and a refund can only ever return money that a charge brought in.
 * Falls back to `total` for orders with no ledger rollup yet (legacy rows).
 */
export function refundableAmount(order: {
  total: number;
  amount_refunded?: number | null;
  amount_captured?: number | null;
}): number {
  const captured = Number(order.amount_captured ?? 0);
  const ceiling = captured > 0 ? captured : Number(order.total);
  const refunded = Number(order.amount_refunded ?? 0);
  return Math.max(0, Math.round((ceiling - refunded) * 100) / 100);
}

export function refundIdempotencyKey(orderId: string, amountCents: number): string {
  return `admin_refund_${orderId}_${amountCents}`;
}

/**
 * A Staff refund's key: one per refund dialog, per intent. Keyed on the amount
 * instead, a second, deliberate refund of the same figure (two S$10 mistakes)
 * would replay the first at Stripe and move no money.
 */
export function staffRefundIdempotencyKey(
  orderId: string,
  requestId: string,
  paymentIntentId: string,
): string {
  return `admin_refund_${orderId}_${requestId}_${paymentIntentId}`;
}

/** Why Staff refunded. Shown on the timeline; mapped to Stripe's own reasons. */
export const STAFF_REFUND_REASONS = ["charged_in_error", "duplicate", "returned", "other"] as const;
export type StaffRefundReason = (typeof STAFF_REFUND_REASONS)[number];

export const STAFF_REFUND_REASON_LABELS: Record<StaffRefundReason, string> = {
  charged_in_error: "Charged in error",
  duplicate: "Duplicate charge",
  returned: "Customer returned it",
  other: "Other",
};

/** Stripe knows three reasons; a charging mistake is none of them, so it sends none. */
export function stripeRefundReason(
  reason: StaffRefundReason,
): "duplicate" | "requested_by_customer" | undefined {
  if (reason === "duplicate") return "duplicate";
  if (reason === "returned") return "requested_by_customer";
  return undefined;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface RefundOrderTotals {
  subtotal: number;
  shipping_amount: number;
  total: number;
}

export interface RefundLine {
  id: string;
  quantity: number;
  total_price: number;
}

/**
 * What the customer paid for `quantity` of a line: its list price's share of
 * the cash the Order took for goods (the total less shipping), so a coupon,
 * points and tax come off every line in proportion. Points used are never
 * refunded (ADR 0030), and this share is cash only.
 */
export function lineRefundAmount(
  order: RefundOrderTotals,
  line: RefundLine,
  quantity: number,
): number {
  const subtotal = Number(order.subtotal);
  if (!(subtotal > 0) || !(line.quantity > 0)) return 0;
  const qty = Math.min(Math.max(0, Math.floor(quantity)), line.quantity);
  const goodsPaid = Math.max(0, Number(order.total) - Number(order.shipping_amount ?? 0));
  const lineShare = (Number(line.total_price) / subtotal) * goodsPaid;
  return round2((lineShare * qty) / line.quantity);
}

export interface RefundSelection {
  items: Array<{ order_item_id: string; quantity: number }>;
  /** Refund the shipping the Order charged, too. */
  shipping: boolean;
}

/** The refund a set of lines (and, optionally, the shipping) works out to. */
export function selectionRefundAmount(
  order: RefundOrderTotals,
  lines: RefundLine[],
  selection: RefundSelection,
): number {
  const byId = new Map(lines.map((l) => [l.id, l]));
  let sum = selection.shipping ? Number(order.shipping_amount ?? 0) : 0;
  for (const s of selection.items) {
    const line = byId.get(s.order_item_id);
    if (line) sum += lineRefundAmount(order, line, s.quantity);
  }
  return round2(sum);
}

export interface IntentBalance {
  paymentIntentId: string;
  /** What Stripe will still refund on the intent's charge, in cents. */
  refundableCents: number;
}

/**
 * Spread a refund over the intents an Order was paid on. One for most Orders;
 * a Result topped up past its hold was paid on two (ADR 0016), and Stripe
 * refunds each charge only up to what it took. Fills the largest first, so a
 * refund that fits one charge is one refund on the customer's statement. Null
 * when the intents hold less than asked.
 */
export function splitRefundAcrossIntents(
  amountCents: number,
  balances: IntentBalance[],
): Array<{ paymentIntentId: string; cents: number }> | null {
  const parts: Array<{ paymentIntentId: string; cents: number }> = [];
  let left = amountCents;
  const largestFirst = [...balances].sort((a, b) => b.refundableCents - a.refundableCents);
  for (const b of largestFirst) {
    if (left <= 0) break;
    const cents = Math.min(left, b.refundableCents);
    if (cents <= 0) continue;
    parts.push({ paymentIntentId: b.paymentIntentId, cents });
    left -= cents;
  }
  return left > 0 ? null : parts;
}

export function cancelRefundIdempotencyKey(orderId: string, amountCents: number): string {
  return `admin_cancel_${orderId}_${amountCents}`;
}

export function isPaidOrder(order: {
  payment_reference: string | null;
  paid_at: string | null;
  status: string;
  amount_captured?: number | null;
}): boolean {
  if (!order.payment_reference) return false;
  if (UNPAID_STATUSES.has(order.status)) return false;
  if (order.paid_at) return true;
  return Number(order.amount_captured ?? 0) > 0;
}
