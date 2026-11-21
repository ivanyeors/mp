import {
  applyShopifyRefund,
  upsertShopifyOrderMirror,
  type ShopifyOrderLike,
  type ShopifyRefundLike,
} from '@/lib/shopify/order-mirror-ingest'

export function isShopifyRefundPayload(value: unknown): value is ShopifyRefundLike {
  if (!value || typeof value !== 'object') return false
  const v = value as { id?: unknown; order_id?: unknown }
  return typeof v.id === 'number' && typeof v.order_id === 'number'
}

export async function bestEffortUpsertOrderMirror(
  payload: ShopifyOrderLike,
  opts?: Parameters<typeof upsertShopifyOrderMirror>[1],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await upsertShopifyOrderMirror(payload, opts)
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    // ponytail: swallow so the webhook stays 200; slice 05 catch-up re-pulls missed mirror rows.
    console.error('Shopify order mirror upsert failed (catch-up will retry)', error)
    return { ok: false, error }
  }
}

export async function bestEffortApplyRefundMirror(
  payload: ShopifyRefundLike,
  opts?: Parameters<typeof applyShopifyRefund>[1],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await applyShopifyRefund(payload, opts)
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('Shopify refund mirror apply failed (catch-up will retry)', error)
    return { ok: false, error }
  }
}
