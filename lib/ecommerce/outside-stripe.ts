export const OUTSIDE_STRIPE_SOURCE = "outside_stripe";

export const OUTSIDE_STRIPE_METHODS = ["cash", "bank_transfer", "other"] as const;
export type OutsideStripeMethod = (typeof OUTSIDE_STRIPE_METHODS)[number];

export const OUTSIDE_STRIPE_METHOD_LABELS: Record<OutsideStripeMethod, string> = {
  cash: "Cash",
  bank_transfer: "PayNow or bank transfer to our account",
  other: "Another way",
};

export function isOutsideStripeMethod(value: unknown): value is OutsideStripeMethod {
  return typeof value === "string" && (OUTSIDE_STRIPE_METHODS as readonly string[]).includes(value);
}

export function paidOutsideStripe(order: { paid_at?: string | null; payment_method?: string | null }): boolean {
  return Boolean(order.paid_at) && isOutsideStripeMethod(order.payment_method);
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (isOutsideStripeMethod(method)) return `${OUTSIDE_STRIPE_METHOD_LABELS[method]} (outside Stripe)`;
  return method === "stripe" ? "Stripe" : (method ?? "—");
}

export const PAID_OUTSIDE_STRIPE_REFUND =
  "This order was paid outside Stripe, so there is no card payment to send back. Return the money the way it came, then use Record refund on the order.";

export function isSaleCharge(row: { stripe_object_id?: string | null; metadata?: unknown }): boolean {
  if (row.stripe_object_id) return true;
  const metadata = row.metadata;
  return (
    typeof metadata === "object" && metadata !== null && (metadata as { source?: unknown }).source === OUTSIDE_STRIPE_SOURCE
  );
}
