/**
 * Run: npx tsx lib/shopify/sales-queue-idempotency.check.ts
 *
 * Documents enqueue + commit idempotency contracts for Shopify sales queue:
 * - Enqueue upsert uses ignoreDuplicates (ON CONFLICT DO NOTHING) and omits status
 * - Commit deduct checks metadata->>shopify_queue_id before inserting ledger rows
 */
import assert from 'node:assert/strict'

export const SHOPIFY_QUEUE_UPSERT_ON_CONFLICT =
  'shopify_order_id,shopify_line_item_id,shopify_variant_id,kind' as const

export const SHOPIFY_QUEUE_LEDGER_KEY = 'shopify_queue_id' as const

/** Enqueue rows must omit status so inserts default to pending and conflicts never resurrect archived rows. */
export function assertEnqueueRowOmitsStatus(row: Record<string, unknown>) {
  assert.ok(!('status' in row), 'enqueue payload must not include status')
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
})

assert.throws(
  () => assertEnqueueRowOmitsStatus({ status: 'pending', shopify_order_id: 1 }),
  /must not include status/,
)

assert.deepEqual(shopifyQueueLedgerFilter(42), { key: 'shopify_queue_id', value: '42' })
assert.equal(SHOPIFY_QUEUE_UPSERT_ON_CONFLICT.split(',').length, 4)

console.log('sales-queue-idempotency.check.ts ok', {
  upsertOnConflict: SHOPIFY_QUEUE_UPSERT_ON_CONFLICT,
  ledgerKey: SHOPIFY_QUEUE_LEDGER_KEY,
})
