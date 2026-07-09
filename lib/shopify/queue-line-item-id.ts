/** Stable upsert key when Shopify omits line_items[].id (e.g. orders `fields=` filter). ponytail: synthetic negative id; real Shopify ids are positive. */
export function resolveShopifyQueueLineItemId(
  orderId: number,
  lineIndex: number,
  lineItemId: number | null | undefined,
): number {
  if (typeof lineItemId === "number" && Number.isFinite(lineItemId) && lineItemId > 0) {
    return lineItemId;
  }
  return -(orderId * 10_000 + lineIndex + 1);
}
