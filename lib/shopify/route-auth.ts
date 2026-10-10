import type { NextResponse } from 'next/server'
import { requireBearerOrAdmin } from '@/lib/auth/bearer-or-admin'

/** Shopify admin POST guard: `Bearer $SHOPIFY_SYNC_TOKEN` or an `inventory` Staff session. */
export function requireSyncTokenOrAdmin(req: Request): Promise<NextResponse | null> {
  return requireBearerOrAdmin(req, 'SHOPIFY_SYNC_TOKEN', 'shopify-link')
}
