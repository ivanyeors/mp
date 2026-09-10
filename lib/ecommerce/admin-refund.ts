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
