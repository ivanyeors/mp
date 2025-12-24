import { NextRequest, NextResponse } from 'next/server'
import { getShopifyEnv } from '@/lib/shopify/env'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'

export const runtime = 'nodejs'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  const env = getShopifyEnv()
  const required = env.syncToken
  if (required) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
    if (!token || token !== required) return unauthorized()
  }

  try {
    const result = await syncShopifyInventoryFromBuildable()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


