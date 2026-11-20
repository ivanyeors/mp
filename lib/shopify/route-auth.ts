import type { NextResponse } from 'next/server'
import { requireBearerOrAdmin } from '@/lib/auth/bearer-or-admin'

export function requireSyncTokenOrAdmin(req: Request): Promise<NextResponse | null> {
  return requireBearerOrAdmin(req, 'SHOPIFY_SYNC_TOKEN', 'shopify-link')
}
