import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getShopifyEnv } from '@/lib/shopify/env'
import { shopifyGetPrimaryLocationId } from '@/lib/shopify/client'

export const runtime = 'nodejs'

type BuildableRow = { size: string; buildable: number | string }

export async function GET(_req: NextRequest) {
  try {
    const env = getShopifyEnv()
    const admin = supabaseAdmin()

    const [{ count: mappingsCount }, { data: buildableRows }] = await Promise.all([
      admin.from('shopify_variant_mappings').select('*', { count: 'exact', head: true }),
      admin.from('product_buildable').select('size,buildable'),
    ])

    const locationId = await shopifyGetPrimaryLocationId()

    return NextResponse.json({
      ok: true,
      shopDomain: env.shopDomain,
      apiVersion: env.apiVersion,
      locationId,
      mappingsCount: mappingsCount ?? 0,
      pillowBuildable: (buildableRows ?? []).reduce<Record<string, number>>((acc, r: BuildableRow) => {
        acc[String(r.size)] = Number(r.buildable)
        return acc
      }, {}),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Diagnostics failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


