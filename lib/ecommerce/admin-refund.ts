const UNPAID_STATUSES = new Set(["pending", "payment_failed", "cancelled"]);

export function refundableAmount(order: { total: number; amount_refunded?: number | null }): number {
  const total = Number(order.total);
  const refunded = Number(order.amount_refunded ?? 0);
  return Math.max(0, Math.round((total - refunded) * 100) / 100);
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
