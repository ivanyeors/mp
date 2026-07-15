/**
 * Run: npx tsx lib/shopify/order-mirror-catchup.check.ts
 *
 * Slice 05: cursor survives partial runs, chain wiring, exactly 2 crons.
 * No live Shopify — fetchPage is a fixture.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  planShopifySyncCursorAdvance,
  type SyncStateRow,
} from '@/lib/shopify/order-mirror-ingest'
import { runShopifyOrderMirrorCatchup } from '@/lib/shopify/order-mirror-catchup'
import type { ShopifyOrderLite, ShopifyOrdersPage } from '@/lib/shopify/orders'

const root = path.resolve(process.cwd())

async function main() {
  // --- vercel.json still exactly two crons (no third catch-up entry) ---
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.equal(vercel.crons.length, 2, 'Hobby: exactly two vercel.json crons')
  assert.ok(
    vercel.crons.every((c) => !/shopify|catch.?up|mirror/i.test(c.path)),
    'catch-up must not be a vercel.json cron',
  )
  assert.ok(
    vercel.crons.some((c) => c.path === '/api/cron/results-sla'),
    'results-sla cron must remain',
  )

  // Shopify page_info cursors reject sibling filters (status) — only page_info + limit.
  const ordersSrc = fs.readFileSync(path.join(root, 'lib/shopify/orders.ts'), 'utf8')
  assert.match(
    ordersSrc,
    /page_info cursor requests may only send page_info \+ limit/,
    'document page_info + limit-only rule',
  )
  assert.doesNotMatch(
    ordersSrc,
    /qs\.set\('status', 'any'\)\s*\n\s*qs\.set\('limit'/,
    'status must not be set before page_info branch',
  )

  // --- chain call site in results-sla (same request) ---
  const slaSrc = fs.readFileSync(path.join(root, 'app/api/cron/results-sla/route.ts'), 'utf8')
  assert.match(slaSrc, /runShopifyOrderMirrorCatchup/, 'results-SLA must chain catch-up')
  assert.match(
    slaSrc,
    /Chain: same request after SLA/,
    'document same-request chain (not a third cron)',
  )

  // --- cursor advances across budgeted pages; partial progress survives ---
  const at = '2026-07-15T01:00:00.000Z'
  let state: SyncStateRow = {
    id: 1,
    phase: 'backfill',
    cursor_token: null,
    since_id: null,
    last_success_at: null,
    updated_at: at,
  }

  const pages: ShopifyOrdersPage[] = [
    {
      orders: [
        {
          id: 10,
          financial_status: 'paid',
          line_items: [{ id: 1, sku: 'a', quantity: 1, variant_id: 1, price: '1' }],
        },
        {
          id: 11,
          financial_status: 'pending',
          line_items: [{ id: 2, sku: 'b', quantity: 1, variant_id: 2, price: '1' }],
        },
      ],
      nextPageInfo: 'cursor-page-2',
    },
    {
      orders: [
        {
          id: 20,
          financial_status: 'paid',
          line_items: [{ id: 3, sku: 'c', quantity: 1, variant_id: 3, price: '2' }],
        },
      ],
      nextPageInfo: null,
    },
  ]

  let fetchCalls = 0
  const fetchPage = async (): Promise<ShopifyOrdersPage> => {
    const page = pages[fetchCalls] ?? { orders: [] as ShopifyOrderLite[], nextPageInfo: null }
    fetchCalls += 1
    return page
  }

  const upsertedIds: number[] = []

  const run1 = await runShopifyOrderMirrorCatchup({
    maxPages: 1,
    maxMs: 60_000,
    pageSize: 50,
    now: new Date(at),
    fetchPage,
    getState: async () => state,
    advance: async (patch, opts) => {
      state = planShopifySyncCursorAdvance(state, patch, opts?.now?.toISOString() ?? at)
      return state
    },
    upsert: async (order) => {
      upsertedIds.push(order.id)
      return { ok: true }
    },
  })

  assert.equal(run1.pages, 1)
  assert.equal(run1.upserted, 1, 'only paid upserted')
  assert.equal(run1.skipped, 1, 'pending skipped')
  assert.equal(run1.budgetHit, true, 'maxPages=1 stops mid-backfill')
  assert.equal(run1.exhausted, false)
  assert.equal(state.since_id, 11, 'since_id advanced after page 1')
  assert.equal(state.cursor_token, 'cursor-page-2', 'page_info persisted for next invoke')
  assert.equal(state.phase, 'backfill')
  assert.deepEqual(upsertedIds, [10])

  // Second invoke resumes — history finishes → reconcile
  const run2 = await runShopifyOrderMirrorCatchup({
    maxPages: 3,
    maxMs: 60_000,
    pageSize: 50,
    now: new Date(at),
    fetchPage,
    getState: async () => state,
    advance: async (patch, opts) => {
      state = planShopifySyncCursorAdvance(state, patch, opts?.now?.toISOString() ?? at)
      return state
    },
    upsert: async (order) => {
      upsertedIds.push(order.id)
      return { ok: true }
    },
  })

  assert.equal(run2.exhausted, true)
  assert.equal(state.phase, 'reconcile', 'backfill → reconcile when pages exhausted')
  assert.equal(state.cursor_token, null)
  assert.equal(state.since_id, 20)
  assert.equal(state.last_success_at, at)
  assert.deepEqual(upsertedIds, [10, 20])
  assert.ok(fetchCalls >= 2, 'resumed with a second fetch')

  console.log('order-mirror-catchup.check.ts ok', {
    crons: vercel.crons.length,
    chained: true,
    since_id: state.since_id,
    phase: state.phase,
    upserted: upsertedIds,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
