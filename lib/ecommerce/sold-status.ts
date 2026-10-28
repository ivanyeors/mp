/** Order statuses that mean the goods are sold, so their stock has left. Pure: the Order page reads it too. */
export const SOLD_ORDER_STATUSES: readonly string[] = ["confirmed", "processing", "shipped", "delivered"];

export function isSoldOrderStatus(status: string | null | undefined): boolean {
  return !!status && SOLD_ORDER_STATUSES.includes(status);
}
