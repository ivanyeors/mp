export function shouldFulfilOrder(
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | string,
): boolean {
  return paymentStatus !== "unpaid";
}
