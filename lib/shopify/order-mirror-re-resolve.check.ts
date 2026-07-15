/**
 * Run: npx tsx lib/shopify/order-mirror-re-resolve.check.ts
 *
 * Slice 06: Others graduates after mapping+cost; healthy frozen untouched.
 */
import assert from 'node:assert/strict'
import {
  planReResolveMirrorLines,
  type CostingsContext,
  type MirrorLineRow,
} from './order-mirror-ingest'

const at = '2026-07-15T02:00:00.000Z'

const othersLine: MirrorLineRow = {
  shopify_line_item_id: 1,
  shopify_order_id: 9001,
  shopify_variant_id: 101,
  sku: 'COVER',
  title: 'Cover',
  quantity: 2,
  gross_revenue: 40,
  unit_cost: null,
  total_cost: null,
  mapping_kind: null,
  is_others: true,
  updated_at: '2026-07-01T00:00:00.000Z',
}

const frozenLine: MirrorLineRow = {
  shopify_line_item_id: 2,
  shopify_order_id: 9001,
  shopify_variant_id: 202,
  sku: 'BOLSTER',
  title: 'Bolster',
  quantity: 1,
  gross_revenue: 50,
  unit_cost: 25,
  total_cost: 25,
  mapping_kind: 'bolster',
  is_others: false,
  updated_at: '2026-07-01T00:00:00.000Z',
}

// Before mapping+cost: Others stays Others
const emptyCtx: CostingsContext = {
  mappingsByVariantId: new Map(),
  pillowProductIdByKindSize: new Map(),
  bomByPillowProductId: new Map(),
  bomByBolsterVariant: new Map(),
  costByItemId: new Map(),
}
assert.equal(planReResolveMirrorLines([othersLine, frozenLine], emptyCtx, { at }).length, 0)

// Mapping + Costings available for variant 101 → Others graduates
const resolvedCtx: CostingsContext = {
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

const patches = planReResolveMirrorLines([othersLine, frozenLine], resolvedCtx, {
  variantIds: [101],
  at,
})
assert.equal(patches.length, 1, 'only the Others line is patched')
assert.equal(patches[0]!.shopify_line_item_id, 1)
assert.equal(patches[0]!.is_others, false)
assert.equal(patches[0]!.unit_cost, 10)
assert.equal(patches[0]!.total_cost, 20)
assert.equal(patches[0]!.mapping_kind, 'part')

// Global Costings re-resolve still leaves healthy frozen alone (even if BOM cheaper now)
const cheaperCtx: CostingsContext = {
  ...resolvedCtx,
  costByItemId: new Map([
    [7, 1],
    [8, 1],
  ]),
}
const globalPatches = planReResolveMirrorLines([othersLine, frozenLine], cheaperCtx, { at })
assert.equal(globalPatches.length, 1)
assert.equal(globalPatches[0]!.shopify_line_item_id, 1)
assert.equal(globalPatches[0]!.unit_cost, 1)
const frozenStill = [othersLine, frozenLine].find((l) => l.shopify_line_item_id === 2)!
assert.equal(frozenStill.unit_cost, 25, 'unrelated frozen line unchanged')
assert.equal(
  globalPatches.some((p) => p.shopify_line_item_id === 2),
  false,
  'frozen line not in patches',
)

// Mapped gap (is_others, null cost) fills when Costings arrives
const gapLine: MirrorLineRow = {
  ...othersLine,
  shopify_line_item_id: 3,
  shopify_variant_id: 303,
  mapping_kind: 'part',
  is_others: true,
  unit_cost: null,
  total_cost: null,
}
const gapCtx: CostingsContext = {
  mappingsByVariantId: new Map([
    [
      303,
      {
        shopify_variant_id: 303,
        kind: 'part',
        pillow_size: null,
        pillow_kind: null,
        bolster_variant: null,
        item_id: 99,
      },
    ],
  ]),
  pillowProductIdByKindSize: new Map(),
  bomByPillowProductId: new Map(),
  bomByBolsterVariant: new Map(),
  costByItemId: new Map([[99, 4.5]]),
}
const gapPatches = planReResolveMirrorLines([gapLine, frozenLine], gapCtx, { at })
assert.equal(gapPatches.length, 1)
assert.equal(gapPatches[0]!.unit_cost, 4.5)
assert.equal(gapPatches[0]!.total_cost, 9)
assert.equal(gapPatches[0]!.is_others, false)

console.log('order-mirror-re-resolve.check.ts ok', {
  graduated: patches[0]!.unit_cost,
  frozenPreserved: frozenStill.unit_cost,
  gapFilled: gapPatches[0]!.unit_cost,
})
