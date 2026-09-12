/**
 * Should a completed Checkout Session fulfil its order?
 *
 * Extracted from the webhook so the decision is testable without a Stripe
 * event. The subtlety worth a named function: Stripe has THREE payment
 * statuses, and only one of them blocks fulfilment.
 *
 * - `paid`                → money claimed, fulfil.
 * - `no_payment_required` → a 100%-discount order. Legitimately zero, fulfil.
 *   Nothing else will ever arrive for it, so blocking here strands it forever.
 * - `unpaid`              → a delayed-notification method is mid-flight. Wait
 *   for `checkout.session.async_payment_succeeded`.
 *
 * Testing `!== "paid"` instead is the trap: it strands every free order.
 */
export function shouldFulfilOrder(
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | string,
): boolean {
  return paymentStatus !== "unpaid";
}
