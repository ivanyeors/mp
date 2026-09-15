import type { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { secretMatches } from '@/lib/auth/secret'

/**
 * Guard for the Shopify admin POST routes. Automation presents
 * `Authorization: Bearer $SHOPIFY_SYNC_TOKEN`; otherwise an `inventory` Staff
 * session is required. Returns the denial response, or null when authorised.
 * An unset token never opens the route.
 */
export async function requireSyncTokenOrAdmin(req: Request): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : null
  if (secretMatches(process.env.SHOPIFY_SYNC_TOKEN?.trim(), token)) return null
  return requireAdmin('inventory')
}
