import { NextRequest, NextResponse } from 'next/server'
import { getShopifyWebhookSecret } from '@/lib/shopify/env'
import { verifyShopifyWebhookHmac } from '@/lib/shopify/verify'
import {
  bestEffortApplyRefundMirror,
  bestEffortUpsertOrderMirror,
  isShopifyRefundPayload,
} from '@/lib/shopify/webhook-mirror'
import type { ShopifyOrderLike } from '@/lib/shopify/order-mirror-ingest'

export const runtime = 'nodejs'

function isShopifyOrder(value: unknown): value is ShopifyOrderLike {
  if (!value || typeof value !== 'object') return false
  const v = value as { id?: unknown; line_items?: unknown }
  if (typeof v.id !== 'number') return false
  return Array.isArray(v.line_items)
}

export async function POST(req: NextRequest) {
  const webhookSecret = getShopifyWebhookSecret()

  const rawBody = await req.text()
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256')
  const ok = verifyShopifyWebhookHmac({ rawBody, webhookSecret, hmacHeader })
  if (!ok) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (isShopifyRefundPayload(payload)) {
    await bestEffortApplyRefundMirror(payload)
    return NextResponse.json({ ok: true, refund: true })
  }

  if (!isShopifyOrder(payload)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  await bestEffortUpsertOrderMirror(payload)
  return NextResponse.json({ ok: true })
}
