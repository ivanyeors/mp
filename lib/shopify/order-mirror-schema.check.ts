/**
 * Run: npx tsx lib/shopify/order-mirror-schema.check.ts
 *
 * Asserts slice 02 migration SQL declares mirror tables + unique keys
 * and does not touch shopify_sales_queue.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const migrationPath = join(
  root,
  'supabase/migrations/20260715013000_shopify_order_mirror_schema.sql',
)
const sql = readFileSync(migrationPath, 'utf8')

const requiredTables = [
  'shopify_orders',
  'shopify_order_lines',
  'shopify_order_refunds',
  'shopify_sync_state',
] as const

for (const table of requiredTables) {
  assert.match(sql, new RegExp(`create table if not exists ${table}\\b`, 'i'), `missing table ${table}`)
}

// Unique / PK idempotency keys
assert.match(sql, /shopify_order_id\s+bigint\s+primary key/i, 'orders need unique shopify_order_id')
assert.match(sql, /shopify_line_item_id\s+bigint\s+primary key/i, 'lines need unique shopify_line_item_id')
assert.match(sql, /shopify_refund_id\s+bigint\s+primary key/i, 'refunds need unique shopify_refund_id')

// Sync cursor fields
assert.match(sql, /phase\s+text[\s\S]*check\s*\(\s*phase\s+in\s*\(\s*'backfill'\s*,\s*'reconcile'\s*\)\s*\)/i)
assert.match(sql, /\bcursor_token\b/i)
assert.match(sql, /\bsince_id\b/i)
assert.match(sql, /\blast_success_at\b/i)
assert.match(sql, /id\s+int\s+primary key[\s\S]*check\s*\(\s*id\s*=\s*1\s*\)/i, 'single-row sync state')

// Others / cost freeze columns on lines
assert.match(sql, /\bis_others\b/i)
assert.match(sql, /\bunit_cost\b/i)
assert.match(sql, /\btotal_cost\b/i)
assert.match(sql, /\bpaid_at\b/i)

// Sales queue must stay untouched
assert.doesNotMatch(sql, /\balter\s+table\s+shopify_sales_queue\b/i)
assert.doesNotMatch(sql, /\bdrop\s+table\s+shopify_sales_queue\b/i)
assert.doesNotMatch(sql, /\bdrop\s+index\s+\S*shopify_sales_queue/i)
assert.match(sql, /Share shopify_order_id only/i, 'document shared shopify_order_id')

console.log('order-mirror-schema.check.ts ok', {
  migration: '20260715013000_shopify_order_mirror_schema.sql',
  tables: requiredTables.length,
})
