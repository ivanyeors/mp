import { NextRequest, NextResponse } from 'next/server'
import { requireSyncTokenOrAdmin } from '@/lib/shopify/route-auth'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'
import { syncShopifyPricingFromSupabase } from '@/lib/shopify/pricing'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSyncTokenOrAdmin(req)
    if (denied) return denied
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


