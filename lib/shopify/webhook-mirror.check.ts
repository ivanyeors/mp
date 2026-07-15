/**
 * Run: npx tsx lib/shopify/webhook-mirror.check.ts
 *
 * Proves webhook mirror wiring without live Shopify:
 * - paid path invokes upsert (via bestEffort → ingest)
 * - refund path invokes apply
 * - mirror failure does not throw (queue-safe policy)
 * - route still enqueues shopify_sales_queue
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bestEffortApplyRefundMirror,
  bestEffortUpsertOrderMirror,
  isShopifyRefundPayload,
} from './webhook-mirror'
import type { CostingsContext } from './order-mirror-ingest'

const emptyCtx: CostingsContext = {
  mappingsByVariantId: new Map(),
  pillowProductIdByKindSize: new Map(),
  bomByPillowProductId: new Map(),
  bomByBolsterVariant: new Map(),
  costByItemId: new Map(),
}

type Call = { table: string; op: string }

function mockAdmin(recorder: Call[], opts?: { failUpsert?: boolean }) {
  return {
    from(table: string) {
      return {
        select() {
          recorder.push({ table, op: 'select' })
          const result = Promise.resolve({ data: [], error: null })
          const chain = {
            eq() {
              return chain
            },
            in() {
              return chain
            },
            maybeSingle: async () => ({ data: null, error: null }),
            then: result.then.bind(result),
            catch: result.catch.bind(result),
          }
          return chain
        },
        upsert(rows: unknown) {
          recorder.push({ table, op: 'upsert' })
          void rows
          if (opts?.failUpsert) {
            return Promise.resolve({ error: { message: 'forced upsert failure' } })
          }
          return Promise.resolve({ error: null })
        },
        update() {
          recorder.push({ table, op: 'update' })
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    },
  }
}

async function main() {
  // --- classify ---
  assert.equal(isShopifyRefundPayload({ id: 55, order_id: 900104 }), true)
  assert.equal(isShopifyRefundPayload({ id: 1, line_items: [] }), false)
  assert.equal(isShopifyRefundPayload(null), false)

  // --- paid path invokes upsert ---
  {
    const calls: Call[] = []
    const admin = mockAdmin(calls) as never
    const result = await bestEffortUpsertOrderMirror(
      {
        id: 900104,
        name: '#WH-900104',
        currency: 'SGD',
        financial_status: 'paid',
        processed_at: '2026-07-15T02:00:00.000Z',
        total_price: '25.00',
        line_items: [
          { id: 7001, title: 'Part', sku: 'P1', quantity: 1, variant_id: null, price: '25.00' },
        ],
      },
      { admin, costCtx: emptyCtx, now: new Date('2026-07-15T02:00:00.000Z') },
    )
    assert.equal(result.ok, true)
    assert.ok(calls.some((c) => c.table === 'shopify_orders' && c.op === 'upsert'))
    assert.ok(calls.some((c) => c.table === 'shopify_order_lines' && c.op === 'upsert'))
  }

  // --- mirror failure swallowed (queue-safe) ---
  {
    const calls: Call[] = []
    const admin = mockAdmin(calls, { failUpsert: true }) as never
    const result = await bestEffortUpsertOrderMirror(
      {
        id: 900105,
        financial_status: 'paid',
        currency: 'SGD',
        total_price: '1',
        line_items: [{ id: 1, quantity: 1, price: '1' }],
      },
      { admin, costCtx: emptyCtx },
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /forced upsert failure/)
  }

  // --- refund path invokes apply ---
  {
    const calls: Call[] = []
    const admin = {
      from(table: string) {
        if (table === 'shopify_order_refunds') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
            upsert: async () => {
              calls.push({ table, op: 'upsert' })
              return { error: null }
            },
          }
        }
        if (table === 'shopify_orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { shopify_order_id: 900104, amount_refunded: 0 },
                }),
              }),
            }),
            update: () => {
              calls.push({ table, op: 'update' })
              return { eq: async () => ({ error: null }) }
            },
          }
        }
        if (table === 'shopify_order_lines') {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    } as never

    const result = await bestEffortApplyRefundMirror(
      {
        id: 88001,
        order_id: 900104,
        currency: 'SGD',
        created_at: '2026-07-15T03:00:00.000Z',
        transactions: [{ kind: 'refund', status: 'success', amount: '5.00' }],
        refund_line_items: [],
      },
      { admin },
    )
    assert.equal(result.ok, true)
    assert.ok(calls.some((c) => c.table === 'shopify_order_refunds' && c.op === 'upsert'))
    assert.ok(calls.some((c) => c.table === 'shopify_orders' && c.op === 'update'))
  }

  // --- refund failure swallowed ---
  {
    const admin = {
      from() {
        throw new Error('forced refund failure')
      },
    } as never
    const result = await bestEffortApplyRefundMirror({ id: 1, order_id: 2 }, { admin })
    assert.equal(result.ok, false)
  }

  // --- route wiring: paid → upsert helper; refund → apply; queue unchanged ---
  {
    const route = readFileSync(join(process.cwd(), 'app/api/shopify/webhook/route.ts'), 'utf8')
    assert.match(route, /bestEffortUpsertOrderMirror/)
    assert.match(route, /bestEffortApplyRefundMirror/)
    assert.match(route, /isShopifyRefundPayload/)
    assert.match(route, /shopify_sales_queue/)
    assert.match(route, /Finance mirror: after queue success/)
  }

  console.log('webhook-mirror.check.ts: PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
