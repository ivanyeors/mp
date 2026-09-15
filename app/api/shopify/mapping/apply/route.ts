import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireSyncTokenOrAdmin } from '@/lib/shopify/route-auth'
import { reResolveShopifyLineCosts } from '@/lib/shopify/order-mirror-ingest'

export const runtime = 'nodejs'

const variantId = z.number().int().positive()
const ApplyBody = z.object({
  rows: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ shopify_variant_id: variantId, kind: z.literal('pillow'), pillow_size: z.enum(['XS', 'S', 'M', 'L', 'XL']) }),
        z.object({ shopify_variant_id: variantId, kind: z.literal('bolster'), bolster_variant: z.enum(['short', 'medium', 'long']) }),
      ]),
    )
    .min(1),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSyncTokenOrAdmin(req)
    if (denied) return denied

    const parsed = ApplyBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Provide { rows: [...] }', issues: parsed.error.issues }, { status: 400 })
    }

    const payload = parsed.data.rows.map((r) => {
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


