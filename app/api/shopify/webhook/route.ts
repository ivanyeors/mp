import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getShopifyEnv } from '@/lib/shopify/env'
import { verifyShopifyWebhookHmac } from '@/lib/shopify/verify'
import { sellBolster, sellPillow, sellPart } from '@/app/settings/inventory/actions'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'

export const runtime = 'nodejs'

type ShopifyOrder = {
  id: number
  line_items?: Array<{
    id: number
    sku: string | null
    quantity: number
    variant_id: number | null
  }>
}

type MappingRow = {
  shopify_variant_id: number
  kind: 'pillow' | 'bolster' | 'part'
  pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | null
  bolster_variant: 'short' | 'medium' | 'long' | null
  item_id: number | null
}

function isShopifyOrder(value: unknown): value is ShopifyOrder {
  if (!value || typeof value !== 'object') return false
  const v = value as { id?: unknown; line_items?: unknown }
  if (typeof v.id !== 'number') return false
  return Array.isArray(v.line_items)
}

export async function POST(req: NextRequest) {
  const env = getShopifyEnv()

  const rawBody = await req.text()
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256')
  const ok = verifyShopifyWebhookHmac({ rawBody, webhookSecret: env.webhookSecret, hmacHeader })
  if (!ok) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') || null
  const shopDomain = req.headers.get('x-shopify-shop-domain') || null
  const webhookId = req.headers.get('x-shopify-webhook-id') || null

  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  // Only process order-like payloads; respond 200 for unhandled topics to prevent retries.
  if (!isShopifyOrder(payload)) {
    return NextResponse.json({ ok: true, ignored: true })
  }
  const order = payload

  const admin = supabaseAdmin()

  // Idempotency: if we've processed this order id, no-op.
  const { data: existing } = await admin
    .from('shopify_processed_orders')
    .select('shopify_order_id')
    .eq('shopify_order_id', order.id)
    .maybeSingle()

  if (existing?.shopify_order_id) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Load mappings for all variant_ids in this order.
  const variantIds = Array.from(
    new Set(
      (order.line_items ?? [])
        .map(li => li.variant_id)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    ),
  )

  const mappingByVariantId = new Map<number, MappingRow>()
  if (variantIds.length) {
    const { data: mappings } = await admin
      .from('shopify_variant_mappings')
      .select('shopify_variant_id,kind,pillow_size,bolster_variant,item_id')
      .in('shopify_variant_id', variantIds)
    ;(mappings ?? []).forEach((m: MappingRow) => {
      mappingByVariantId.set(Number(m.shopify_variant_id), m)
    })
  }

  // Build actions based on mappings; ignore unmapped items (but record them for visibility).
  const mappedLines: Array<{ mapping: MappingRow; qty: number }> = []
  const unmappedLines: Array<{ variant_id: number | null; sku: string | null; quantity: number }> = []

  for (const li of order.line_items ?? []) {
    const qty = Math.max(0, Math.floor(Number(li.quantity ?? 0)))
    if (!qty) continue
    const variantId = typeof li.variant_id === 'number' ? li.variant_id : null
    if (!variantId) {
      unmappedLines.push({ variant_id: variantId, sku: li.sku ?? null, quantity: qty })
      continue
    }
    const mapping = mappingByVariantId.get(variantId)
    if (!mapping) {
      unmappedLines.push({ variant_id: variantId, sku: li.sku ?? null, quantity: qty })
      continue
    }
    mappedLines.push({ mapping, qty })
  }

  // Apply inventory decrements for mapped lines.
  try {
    for (const line of mappedLines) {
      const { mapping, qty } = line
      if (mapping.kind === 'pillow' && mapping.pillow_size) {
        const { data: product, error } = await admin
          .from('pillow_products')
          .select('id,size')
          .eq('size', mapping.pillow_size)
          .eq('is_active', true)
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!product?.id) throw new Error(`Missing pillow_products row for size ${mapping.pillow_size}`)
        await sellPillow({ productId: Number(product.id), quantity: qty })
      } else if (mapping.kind === 'bolster' && mapping.bolster_variant) {
        await sellBolster({ quantity: qty, variant: mapping.bolster_variant })
      } else if (mapping.kind === 'part' && mapping.item_id) {
        await sellPart({ itemId: mapping.item_id, quantity: qty })
      }
    }

    // Mark processed after successful application.
    const { error: insErr } = await admin.from('shopify_processed_orders').insert({
      shopify_order_id: order.id,
      webhook_id: webhookId,
      topic,
      shop_domain: shopDomain,
      payload: { ...(order as unknown as Record<string, unknown>), _mp: { mapped: mappedLines.length, unmapped: unmappedLines } },
    })
    if (insErr) throw new Error(insErr.message)

    // Best-effort: sync buildable -> Shopify after processing an order.
    try {
      await syncShopifyInventoryFromBuildable()
    } catch (e) {
      console.error('Shopify sync failed (non-fatal)', e)
    }

    return NextResponse.json({ ok: true, mapped: mappedLines.length, unmapped: unmappedLines.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Webhook processing failed'
    console.error('Shopify webhook processing failed', message)
    // Return 200 so Shopify doesn't keep retrying indefinitely; you can re-run sync manually.
    return NextResponse.json({ ok: false, error: message, mapped: mappedLines.length, unmapped: unmappedLines.length })
  }
}


