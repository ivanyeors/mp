/**
 * Run: npx tsx lib/shopify/order-mirror-ingest.check.ts
 *
 * Fixture-based external behavior for slice 03 ingest (no HTTP / live Shopify).
 */
import assert from 'node:assert/strict'
import {
  buildMirrorLineFromShopify,
  isShopifyPaidFinancialStatus,
  mergeFrozenMirrorLine,
  planShopifyOrderMirrorUpsert,
  planShopifyRefundApply,
  planShopifySyncCursorAdvance,
  resolveShopifyMappingUnitCost,
  selectShopifyPaidAt,
  type CostingsContext,
  type MirrorLineRow,
  type ShopifyOrderLike,
  type SyncStateRow,
} from './order-mirror-ingest'

const at = '2026-07-15T01:00:00.000Z'

const ctx: CostingsContext = {
  mappingsByVariantId: new Map([
    [
      101,
      {
        shopify_variant_id: 101,
        kind: 'part',
        pillow_size: null,
        pillow_kind: null,
        bolster_variant: null,
        item_id: 7,
      },
    ],
    [
      202,
      {
        shopify_variant_id: 202,
        kind: 'bolster',
        pillow_size: null,
        pillow_kind: null,
        bolster_variant: 'medium',
        item_id: null,
      },
    ],
    [
      303,
      {
        shopify_variant_id: 303,
        kind: 'part',
        pillow_size: null,
        pillow_kind: null,
        bolster_variant: null,
        item_id: 99, // uncosted item
      },
    ],
  ]),
  pillowProductIdByKindSize: new Map(),
  bomByPillowProductId: new Map(),
  bomByBolsterVariant: new Map([
    [
      'medium',
      [
        { item_id: 7, quantity: 2 },
        { item_id: 8, quantity: 1 },
      ],
    ],
  ]),
  costByItemId: new Map([
    [7, 10],
    [8, 5],
  ]),
}

// --- paid_at selection ---
assert.equal(isShopifyPaidFinancialStatus('paid'), true)
assert.equal(isShopifyPaidFinancialStatus('pending'), false)
assert.equal(
  selectShopifyPaidAt({
    id: 1,
    financial_status: 'paid',
    created_at: '2026-01-01T00:00:00Z',
    processed_at: '2026-01-02T12:00:00Z',
  }),
  '2026-01-02T12:00:00Z',
  'prefer processed_at over created_at',
)
assert.equal(
  selectShopifyPaidAt({
    id: 1,
    financial_status: 'pending',
    processed_at: '2026-01-02T12:00:00Z',
  }),
  null,
  'unpaid has no paid_at',
)

// --- Costings freeze via mapping rollup ---
assert.equal(resolveShopifyMappingUnitCost(ctx.mappingsByVariantId.get(101)!, ctx), 10)
assert.equal(resolveShopifyMappingUnitCost(ctx.mappingsByVariantId.get(202)!, ctx), 25) // 2*10 + 5
assert.equal(resolveShopifyMappingUnitCost(ctx.mappingsByVariantId.get(303)!, ctx), null)

// --- Order + lines upsert plan (fixture, no HTTP) ---
const paidOrder: ShopifyOrderLike = {
  id: 9001,
  name: '#9001',
  currency: 'SGD',
  financial_status: 'paid',
  created_at: '2026-06-01T08:00:00Z',
  processed_at: '2026-06-01T09:30:00Z',
  total_price: '135.00',
  line_items: [
    { id: 1, variant_id: 101, sku: 'PART-7', title: 'Cover', quantity: 2, price: '40.00' },
    { id: 2, variant_id: 202, sku: 'BOL-M', title: 'Medium Bolster', quantity: 1, price: '50.00' },
    { id: 3, variant_id: 303, sku: 'UNC', title: 'Uncosted part', quantity: 1, price: '5.00' },
    { id: 4, variant_id: 404, sku: 'UNMAP', title: 'Unmapped', quantity: 1, price: '20.00' },
  ],
}

const plan = planShopifyOrderMirrorUpsert(paidOrder, ctx, undefined, at)
assert.equal(plan.ok, true)
if (!plan.ok) throw new Error('expected ok plan')
assert.equal(plan.order.shopify_order_id, 9001)
assert.equal(plan.order.paid_at, '2026-06-01T09:30:00Z')
assert.equal(plan.lines.length, 4)

const [cover, bolster, uncosted, unmapped] = plan.lines
assert.equal(cover.is_others, false)
assert.equal(cover.unit_cost, 10)
assert.equal(cover.total_cost, 20)
assert.equal(cover.gross_revenue, 80)

assert.equal(bolster.is_others, false)
assert.equal(bolster.unit_cost, 25)
assert.equal(bolster.total_cost, 25)
assert.equal(bolster.gross_revenue, 50)

assert.equal(uncosted.is_others, true, 'mapped but null cost → Others')
assert.equal(uncosted.unit_cost, null)
assert.equal(uncosted.total_cost, null)
assert.equal(uncosted.gross_revenue, 5, 'Others keeps revenue')

assert.equal(unmapped.is_others, true, 'unmapped → Others')
assert.equal(unmapped.gross_revenue, 20)
assert.equal(unmapped.unit_cost, null)

// Unpaid skipped
const unpaid = planShopifyOrderMirrorUpsert(
  { ...paidOrder, financial_status: 'pending' },
  ctx,
  undefined,
  at,
)
assert.equal(unpaid.ok, false)
if (unpaid.ok) throw new Error('expected skip')
assert.equal(unpaid.reason, 'not_paid')

// Freeze: later Costings change does not rewrite healthy line without re-resolve
const existingHealthy: MirrorLineRow = {
  ...cover,
  unit_cost: 10,
  total_cost: 20,
  is_others: false,
}
const cheaperCtx: CostingsContext = {
  ...ctx,
  costByItemId: new Map([[7, 1], [8, 1]]),
}
const rebuilt = buildMirrorLineFromShopify(9001, paidOrder.line_items![0], cheaperCtx, at)!
assert.equal(rebuilt.unit_cost, 1, 'fresh build would use new cost')
const frozen = mergeFrozenMirrorLine(existingHealthy, rebuilt)
assert.equal(frozen.unit_cost, 10, 'freeze keeps prior unit_cost')
assert.equal(frozen.total_cost, 20)
assert.equal(frozen.is_others, false)

const rePlan = planShopifyOrderMirrorUpsert(
  paidOrder,
  cheaperCtx,
  { paid_at: '2026-06-01T09:30:00Z', lines: new Map([[1, existingHealthy]]) },
  at,
)
assert.equal(rePlan.ok, true)
if (!rePlan.ok) throw new Error('expected ok')
assert.equal(rePlan.order.paid_at, '2026-06-01T09:30:00Z', 'paid_at unchanged on re-ingest')
assert.equal(rePlan.lines.find((l) => l.shopify_line_item_id === 1)!.unit_cost, 10)

// --- Refund netting + idempotency; paid_at not in refund plan ---
const linesForRefund = new Map([
  [1, { shopify_line_item_id: 1, unit_cost: 10, total_cost: 20, quantity: 2 }],
])
const refundPayload = {
  id: 55,
  order_id: 9001,
  created_at: '2026-06-10T10:00:00Z',
  currency: 'SGD',
  transactions: [{ kind: 'refund', status: 'success', amount: '15.00' }],
  refund_line_items: [{ line_item_id: 1, quantity: 1, restock_type: 'return', subtotal: '15.00' }],
}

const firstRefund = planShopifyRefundApply({
  refund: refundPayload,
  existingRefundIds: new Set(),
  priorAmountRefunded: 0,
  lines: new Map(linesForRefund),
})
assert.equal(firstRefund.alreadyApplied, false)
assert.equal(firstRefund.amountRefunded, 15)
assert.equal(firstRefund.lineCostPatches[0]?.total_cost, 10, 'restock reduces COGS by unit*qty')

const secondRefund = planShopifyRefundApply({
  refund: refundPayload,
  existingRefundIds: new Set([55]),
  priorAmountRefunded: 15,
  lines: new Map(linesForRefund),
})
assert.equal(secondRefund.alreadyApplied, true)
assert.equal(secondRefund.amountRefunded, 15, 'idempotent: no double net')
assert.equal(secondRefund.lineCostPatches.length, 0)

// Money-only refund (no restock) still nets revenue, leaves COGS
const moneyOnly = planShopifyRefundApply({
  refund: {
    id: 56,
    order_id: 9001,
    transactions: [{ kind: 'refund', status: 'success', amount: '5.00' }],
    refund_line_items: [{ line_item_id: 1, quantity: 1, restock_type: 'no_restock', subtotal: '5.00' }],
  },
  existingRefundIds: new Set(),
  priorAmountRefunded: 15,
  lines: new Map(linesForRefund),
})
assert.equal(moneyOnly.amountRefunded, 20)
assert.equal(moneyOnly.lineCostPatches.length, 0, 'no_restock does not drop COGS')

// --- Cursor semantics ---
const current: SyncStateRow = {
  id: 1,
  phase: 'backfill',
  cursor_token: 'abc',
  since_id: 100,
  last_success_at: null,
  updated_at: at,
}
const advanced = planShopifySyncCursorAdvance(
  current,
  { since_id: 50, cursor_token: 'next', last_success_at: at, phase: 'reconcile' },
  at,
)
assert.equal(advanced.since_id, 100, 'since_id only advances forward')
assert.equal(advanced.cursor_token, 'next')
assert.equal(advanced.phase, 'reconcile')
assert.equal(advanced.last_success_at, at)

const forward = planShopifySyncCursorAdvance(current, { since_id: 200 }, at)
assert.equal(forward.since_id, 200)

console.log('order-mirror-ingest.check.ts ok', {
  paidAt: plan.order.paid_at,
  lines: plan.lines.length,
  others: plan.lines.filter((l) => l.is_others).length,
  refundNet: firstRefund.amountRefunded,
  cursorSince: advanced.since_id,
})
