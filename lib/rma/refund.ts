/**
 * RMA refund amount (ADR 0011, slice 06). Pure: the value to refund for a return
 * is the sum of its returned lines at their original unit price. The caller caps
 * this at the order's remaining refundable balance before calling Stripe.
 */
export function rmaRefundAmount(
  items: Array<{ unit_price: number; quantity: number }>,
): number {
  const total = items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
  return Math.round(total * 100) / 100;
}
