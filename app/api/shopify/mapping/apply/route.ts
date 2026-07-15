import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getShopifyEnv } from '@/lib/shopify/env'
import { reResolveShopifyLineCosts } from '@/lib/shopify/order-mirror-ingest'

export const runtime = 'nodejs'

type ApplyRow =
  | { shopify_variant_id: number; kind: 'pillow'; pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' }
  | { shopify_variant_id: number; kind: 'bolster'; bolster_variant: 'short' | 'medium' | 'long' }

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  try {
    const env = getShopifyEnv()
    if (env.syncToken) {
      const auth = req.headers.get('authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
      if (!token || token !== env.syncToken) return unauthorized()
    }

    const body = (await req.json().catch(() => null)) as null | { rows?: ApplyRow[] }
    const rows = body?.rows ?? []
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Provide { rows: [...] }' }, { status: 400 })
    }

    const payload = rows.map((r) => {
      if (r.kind === 'pillow') {
        return {
          shopify_variant_id: r.shopify_variant_id,
          kind: r.kind,
          pillow_size: r.pillow_size,
          bolster_variant: null,
          item_id: null,
        }
      }
      return {
        shopify_variant_id: r.shopify_variant_id,
        kind: r.kind,
        pillow_size: null,
        bolster_variant: r.bolster_variant,
        item_id: null,
      }
    })

    const admin = supabaseAdmin()
    const { error } = await admin.from('shopify_variant_mappings').upsert(payload, { onConflict: 'shopify_variant_id' })
    if (error) throw new Error(error.message)

    const variantIds = payload.map((r) => r.shopify_variant_id)
    after(() => {
      void reResolveShopifyLineCosts({ variantIds }).catch((err) => {
        console.error('[shopify-mirror] re-resolve failed', err)
      })
    })

    return NextResponse.json({ ok: true, upserted: payload.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to apply mappings'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


