export const SOLD_ORDER_STATUSES: readonly string[] = ["confirmed", "processing", "shipped", "delivered"];

export function isSoldOrderStatus(status: string | null | undefined): boolean {
  return !!status && SOLD_ORDER_STATUSES.includes(status);
}
