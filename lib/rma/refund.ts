import {
  selectionRefundAmount,
  type RefundLine,
  type RefundOrderTotals,
} from "@/lib/ecommerce/admin-refund";

export function rmaRefundAmount(
  order: RefundOrderTotals,
  allOrderLines: RefundLine[],
  returned: Array<{ order_item_id: string; quantity: number }>,
): number {
  return selectionRefundAmount(order, allOrderLines, { items: returned, shipping: false });
}
