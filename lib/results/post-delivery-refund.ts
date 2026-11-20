import { isResultOrderBuildSnapshot } from "@/lib/results/order-build-snapshot";

export type RefundRequestStatus = "requested" | "approved" | "rejected";

export type OrderRefundFields = {
  status: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  refund_request_status?: RefundRequestStatus | null;
  amount_refunded?: number | null;
};

export type OrderItemLike = { customization_snapshot?: unknown };

export function isResultCustomisedOrder(items: OrderItemLike[]): boolean {
  return items.some((item) => isResultOrderBuildSnapshot(item.customization_snapshot));
}

export function isPostDelivery(order: OrderRefundFields): boolean {
  return (
    order.status === "shipped" ||
    order.status === "delivered" ||
    !!order.shipped_at ||
    !!order.delivered_at
  );
}

export function customerCancelDeniedReason(
  items: OrderItemLike[],
): string | null {
  if (isResultCustomisedOrder(items)) {
    return "Customised orders cannot be cancelled after Accept. Request a refund after delivery if you return the product in person.";
  }
  return "Customers cannot cancel orders from the account area.";
}

export function customerRefundRequestDeniedReason(
  order: OrderRefundFields,
  items: OrderItemLike[],
): string | null {
  if (!isResultCustomisedOrder(items)) {
    return "Refund requests apply to customised orders only.";
  }
  if (order.status === "refunded" || Number(order.amount_refunded ?? 0) > 0) {
    return "Order already has a refund.";
  }
  if (order.refund_request_status === "requested") {
    return "A refund request is already pending.";
  }
  if (order.refund_request_status === "approved") {
    return "Refund request was already approved.";
  }
  if (!isPostDelivery(order)) {
    return "Refund can only be requested after the order has shipped.";
  }
  return null;
}

export function operatorApproveDeniedReason(
  order: OrderRefundFields,
  items: OrderItemLike[],
  inPersonReturnAcknowledged: boolean,
): string | null {
  if (!isResultCustomisedOrder(items)) {
    return "Refund-request approval applies to customised orders only.";
  }
  if (order.refund_request_status !== "requested") {
    return "No pending refund request to approve.";
  }
  if (!isPostDelivery(order)) {
    return "Cannot approve refund before the order has shipped.";
  }
  if (!inPersonReturnAcknowledged) {
    return "In-person return must be acknowledged before approving the refund.";
  }
  return null;
}

export function operatorRejectDeniedReason(
  order: OrderRefundFields,
  items: OrderItemLike[],
): string | null {
  if (!isResultCustomisedOrder(items)) {
    return "Refund-request rejection applies to customised orders only.";
  }
  if (order.refund_request_status !== "requested") {
    return "No pending refund request to reject.";
  }
  return null;
}

export function staffRefundDeniedReason(
  order: OrderRefundFields,
  items: OrderItemLike[],
  opts: { returned: boolean; inPersonReturnAcknowledged: boolean },
): string | null {
  if (!isResultCustomisedOrder(items) || !opts.returned) return null;
  if (!isPostDelivery(order)) {
    return "A customised order can only be refunded as a return after it has shipped.";
  }
  if (!opts.inPersonReturnAcknowledged) {
    return "Confirm the customer returned the product in person before refunding it as a return.";
  }
  return null;
}
