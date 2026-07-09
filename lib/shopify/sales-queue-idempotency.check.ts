/**
 * Run: npx tsx lib/shopify/sales-queue-idempotency.check.ts
 *
 * Documents enqueue + commit idempotency contracts for Shopify sales queue:
 * - Enqueue upsert omits status; conflicts update display fields only
 * - Commit deduct checks metadata->>shopify_queue_id before inserting ledger rows
 */
import assert from 'node:assert/strict'
import { groupShopifyQueueByOrder } from './shopify-sales-queue-group'

export const SHOPIFY_QUEUE_UPSERT_ON_CONFLICT =
  'shopify_order_id,shopify_line_item_id,shopify_variant_id,kind' as const

export const SHOPIFY_QUEUE_LEDGER_KEY = 'shopify_queue_id' as const

/** Enqueue rows must omit status so inserts default to pending and conflicts never resurrect archived rows. */
export function assertEnqueueRowOmitsStatus(row: Record<string, unknown>) {
  assert.ok(!('status' in row), 'enqueue payload must not include status')
}

/** Enqueue rows must include Shopify order display fields. */
export function assertEnqueueRowHasOrderDisplay(row: Record<string, unknown>) {
  assert.ok('shopify_order_name' in row, 'enqueue payload must include shopify_order_name')
  assert.ok('shopify_order_created_at' in row, 'enqueue payload must include shopify_order_created_at')
}

/** Ledger idempotency filter shape (matches Stripe metadata->>order_id pattern). */
export function shopifyQueueLedgerFilter(queueId: number) {
  return { key: SHOPIFY_QUEUE_LEDGER_KEY, value: String(queueId) }
}

assertEnqueueRowOmitsStatus({
  shopify_order_id: 1001,
  shopify_line_item_id: 2002,
  shopify_variant_id: 3003,
  kind: 'part',
  shopify_order_name: '#1042',
  shopify_order_created_at: '2026-06-24T10:00:00Z',
})

assertEnqueueRowHasOrderDisplay({
  shopify_order_id: 1001,
  shopify_order_name: '#1042',
  shopify_order_created_at: '2026-06-24T10:00:00Z',
})

assert.throws(
  () => assertEnqueueRowOmitsStatus({ status: 'pending', shopify_order_id: 1 }),
  /must not include status/,
)

assert.deepEqual(shopifyQueueLedgerFilter(42), { key: 'shopify_queue_id', value: '42' })
assert.equal(SHOPIFY_QUEUE_UPSERT_ON_CONFLICT.split(',').length, 4)

const grouped = groupShopifyQueueByOrder([
  {
    shopify_order_id: 1,
    shopify_order_name: '#1001',
    shopify_order_created_at: '2026-06-24T10:00:00Z',
    created_at: '2026-07-09T10:00:00Z',
    fulfillment_status: 'unfulfilled',
    id: 10,
  },
  {
    shopify_order_id: 1,
    shopify_order_name: '#1001',
    shopify_order_created_at: '2026-06-24T10:00:00Z',
    created_at: '2026-07-09T10:00:00Z',
    fulfillment_status: 'unfulfilled',
    id: 11,
  },
  {
    shopify_order_id: 2,
    shopify_order_name: '#1002',
    shopify_order_created_at: '2026-06-20T10:00:00Z',
    created_at: '2026-07-08T10:00:00Z',
    fulfillment_status: 'fulfilled',
    id: 12,
  },
] as Array<{
  shopify_order_id: number
  shopify_order_name: string
  shopify_order_created_at: string
  created_at: string
  fulfillment_status: string
  id: number
}>)

assert.equal(grouped.length, 2)
assert.equal(grouped[0]?.orderId, 1)
assert.equal(grouped[0]?.lines.length, 2)
assert.equal(grouped[1]?.orderId, 2)
assert.equal(grouped[1]?.lines.length, 1)

console.log('sales-queue-idempotency.check.ts ok', {
  upsertOnConflict: SHOPIFY_QUEUE_UPSERT_ON_CONFLICT,
  ledgerKey: SHOPIFY_QUEUE_LEDGER_KEY,
  groups: grouped.length,
})
