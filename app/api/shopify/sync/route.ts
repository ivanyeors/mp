import { NextRequest, NextResponse } from 'next/server'
import { getShopifyEnv } from '@/lib/shopify/env'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'
import { syncShopifyPricingFromSupabase } from '@/lib/shopify/pricing'

export const runtime = 'nodejs'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  try {
    const env = getShopifyEnv()
    const required = env.syncToken
    if (required) {
      const auth = req.headers.get('authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
      if (!token || token !== required) return unauthorized()
    }
    const url = new URL(req.url)
    const includePrices = url.searchParams.get('prices') === '1'
    const includeInventory = url.searchParams.get('inventory') !== '0'

    const out: Record<string, unknown> = {}
    if (includeInventory) {
      out.inventory = await syncShopifyInventoryFromBuildable()
    }
    if (includePrices) {
      out.prices = await syncShopifyPricingFromSupabase()
    }

    return NextResponse.json({ ok: true, ...out })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


