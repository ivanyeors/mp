const UNPAID_STATUSES = new Set(["pending", "payment_failed", "cancelled"]);

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

export function staffRefundIdempotencyKey(
  orderId: string,
  requestId: string,
  paymentIntentId: string,
): string {
  return `admin_refund_${orderId}_${requestId}_${paymentIntentId}`;
}

export const STAFF_REFUND_REASONS = ["charged_in_error", "duplicate", "returned", "other"] as const;
export type StaffRefundReason = (typeof STAFF_REFUND_REASONS)[number];

export const STAFF_REFUND_REASON_LABELS: Record<StaffRefundReason, string> = {
  charged_in_error: "Charged in error",
  duplicate: "Duplicate charge",
  returned: "Customer returned it",
  other: "Other",
};

export function stripeRefundReason(
  reason: StaffRefundReason,
): "duplicate" | "requested_by_customer" | undefined {
  if (reason === "duplicate") return "duplicate";
  if (reason === "returned") return "requested_by_customer";
  return undefined;
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

const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

function lineShareCents(order: RefundOrderTotals, lines: RefundLine[]): Map<string, number> {
  const subtotalCents = cents(order.subtotal);
  const shares = new Map<string, number>();
  if (!(subtotalCents > 0)) return shares;
  const goodsCents = Math.max(0, cents(order.total) - cents(order.shipping_amount));
  const exact = lines.map((line, index) => {
    const product = cents(line.total_price) * goodsCents;
    const floor = Math.floor(product / subtotalCents);
    return { id: line.id, index, floor, remainder: product - floor * subtotalCents };
  });
  let owed = goodsCents - exact.reduce((t, e) => t + e.floor, 0);
  const largestRemainderFirst = exact
    .filter((e) => e.remainder > 0)
    .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const roundedUp = new Set<number>();
  for (const e of largestRemainderFirst) {
    if (owed <= 0) break;
    roundedUp.add(e.index);
    owed -= 1;
  }
  for (const e of exact) shares.set(e.id, e.floor + (roundedUp.has(e.index) ? 1 : 0));
  return shares;
}

export function lineRefundAmount(
  order: RefundOrderTotals,
  lines: RefundLine[],
  line: RefundLine,
  quantity: number,
): number {
  if (!(line.quantity > 0)) return 0;
  const share = lineShareCents(order, lines).get(line.id) ?? 0;
  const qty = Math.min(Math.max(0, Math.floor(quantity)), line.quantity);
  return Math.ceil((share * qty) / line.quantity) / 100;
}

export interface RefundSelection {
  items: Array<{ order_item_id: string; quantity: number }>;
  shipping: boolean;
}

export function selectionRefundAmount(
  order: RefundOrderTotals,
  lines: RefundLine[],
  selection: RefundSelection,
): number {
  const byId = new Map(lines.map((l) => [l.id, l]));
  let sumCents = selection.shipping ? cents(order.shipping_amount) : 0;
  for (const s of selection.items) {
    const line = byId.get(s.order_item_id);
    if (line) sumCents += Math.round(lineRefundAmount(order, lines, line, s.quantity) * 100);
  }
  return sumCents / 100;
}

export interface IntentBalance {
  paymentIntentId: string;
  refundableCents: number;
}

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
