import { NextResponse } from 'next/server'
import { secretMatches } from '@/lib/auth/secret'
import { runShopifyOrderMirrorCatchup } from '@/lib/shopify/order-mirror-catchup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ponytail: manual/ops only — not listed in vercel.json (catch-up chains from results-sla).

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return secretMatches(`Bearer ${secret}`, req.headers.get('authorization'))
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const catchup = await runShopifyOrderMirrorCatchup()
    return NextResponse.json({ ok: true, catchup })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'catch-up failed' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}
