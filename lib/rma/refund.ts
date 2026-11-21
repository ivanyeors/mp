import {
  selectionRefundAmount,
  type RefundLine,
  type RefundOrderTotals,
} from "@/lib/ecommerce/admin-refund";
import type { Coupon } from "@/lib/types/ecommerce";

export interface RmaRefundOrder extends RefundOrderTotals {
  discount_amount: number | null;
  points_discount: number | null;
  coupons: { applies_to: Coupon["applies_to"] } | null;
}

export interface RmaRefundLine extends RefundLine {
  unit_price: number;
  kind: string | null;
}

const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

function couponCoversEveryLine(order: RmaRefundOrder, lines: RmaRefundLine[]): boolean {
  const couponOffCents = cents(order.discount_amount) - cents(order.points_discount);
  if (couponOffCents <= 0) return true;
  if (!order.coupons) return false;
  const scope = order.coupons.applies_to;
  if (scope?.product_ids?.length || scope?.category_ids?.length) return false;
  return !lines.some((l) => l.kind === "service");
}

export function rmaRefundAmount(
  order: RmaRefundOrder,
  allOrderLines: RmaRefundLine[],
  returned: Array<{ order_item_id: string; quantity: number }>,
): number {
  if (!couponCoversEveryLine(order, allOrderLines)) {
    // ponytail: the Order does not record which lines a scoped coupon (or a code on an Order with service lines, or a coupon since deleted) took money off, so these returns refund the list price as before, more than was paid for a discounted line; store each line's discount on order_items at checkout and every refund becomes the exact paid share.
    const byId = new Map(allOrderLines.map((l) => [l.id, l]));
    return returned.reduce((t, r) => t + cents(byId.get(r.order_item_id)?.unit_price) * r.quantity, 0) / 100;
  }
  const pricedBeforePoints = { ...order, total: Number(order.total) + Number(order.points_discount ?? 0) };
  return selectionRefundAmount(pricedBeforePoints, allOrderLines, { items: returned, shipping: false });
}
