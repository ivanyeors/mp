export type ShopifyQueueGroupLine = {
  shopify_order_id: number
  shopify_order_name?: string | null
  shopify_order_created_at?: string | null
  created_at?: string
  fulfillment_status?: string | null
}

export type ShopifyOrderGroup<T extends ShopifyQueueGroupLine> = {
  orderId: number
  orderName: string | null
  orderCreatedAt: string | null
  fulfillmentStatus: string | null
  lines: T[]
}

export function groupShopifyQueueByOrder<T extends ShopifyQueueGroupLine>(
  rows: T[],
): ShopifyOrderGroup<T>[] {
  const byOrder = new Map<number, ShopifyOrderGroup<T>>()
  for (const row of rows) {
    const id = row.shopify_order_id
    let group = byOrder.get(id)
    if (!group) {
      group = {
        orderId: id,
        orderName: row.shopify_order_name ?? null,
        orderCreatedAt: row.shopify_order_created_at ?? row.created_at ?? null,
        fulfillmentStatus: row.fulfillment_status ?? null,
        lines: [],
      }
      byOrder.set(id, group)
    }
    group.lines.push(row)
  }
  return Array.from(byOrder.values()).sort((a, b) => {
    const ta = new Date(a.orderCreatedAt ?? 0).getTime()
    const tb = new Date(b.orderCreatedAt ?? 0).getTime()
    return tb - ta
  })
}
