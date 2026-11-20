export function rmaRefundAmount(
  items: Array<{ unit_price: number; quantity: number }>,
): number {
  const total = items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
  return Math.round(total * 100) / 100;
}
