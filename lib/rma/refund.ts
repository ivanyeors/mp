import {
  selectionRefundAmount,
  type RefundLine,
  type RefundOrderTotals,
} from "@/lib/ecommerce/admin-refund";

export function rmaRefundAmount(
  order: RefundOrderTotals & { points_discount: number | null },
  allOrderLines: RefundLine[],
  returned: Array<{ order_item_id: string; quantity: number }>,
): number {
  const pricedBeforePoints = { ...order, total: Number(order.total) + Number(order.points_discount ?? 0) };
  const shareCents = Math.round(
    selectionRefundAmount(pricedBeforePoints, allOrderLines, { items: returned, shipping: false }) * 100,
  );
  const goodsCashCents = Math.max(0, Math.round(Number(order.total) * 100) - Math.round(Number(order.shipping_amount) * 100));
  return Math.min(shareCents, goodsCashCents) / 100;
}
