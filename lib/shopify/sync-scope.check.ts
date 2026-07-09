/**
 * Run: npx tsx lib/shopify/sync-scope.check.ts
 *
 * Proves BOM-aware scoping: depleting a shared filling selects all pillow/bolster
 * mappings that use it — not the whole catalog, and not only the sold variant.
 */
import assert from 'node:assert/strict'
import { selectMappingsAffectedByDepletedItems, type ShopifyMappingRow } from './sync-scope'

const mappings: ShopifyMappingRow[] = [
  { shopify_variant_id: 101, kind: 'pillow', pillow_size: 'M', pillow_kind: 'basic', bolster_variant: null, item_id: null },
  { shopify_variant_id: 102, kind: 'pillow', pillow_size: 'L', pillow_kind: 'basic', bolster_variant: null, item_id: null },
  { shopify_variant_id: 103, kind: 'pillow', pillow_size: 'M', pillow_kind: 'premium', bolster_variant: null, item_id: null },
  { shopify_variant_id: 201, kind: 'bolster', pillow_size: null, pillow_kind: null, bolster_variant: 'medium', item_id: null },
  { shopify_variant_id: 202, kind: 'bolster', pillow_size: null, pillow_kind: null, bolster_variant: 'long', item_id: null },
  { shopify_variant_id: 301, kind: 'part', pillow_size: null, pillow_kind: null, bolster_variant: null, item_id: 10 },
  { shopify_variant_id: 302, kind: 'part', pillow_size: null, pillow_kind: null, bolster_variant: null, item_id: 99 },
  { shopify_variant_id: 401, kind: 'pillow', pillow_size: 'XS', pillow_kind: 'basic', bolster_variant: null, item_id: null },
]

// Shared filling item 7 is used by basic M + L pillows and medium bolster.
const scoped = selectMappingsAffectedByDepletedItems({
  mappings,
  depletedItemIds: [7],
  pillowKeysUsingItems: [
    { kind: 'basic', size: 'M' },
    { kind: 'basic', size: 'L' },
  ],
  bolsterVariantsUsingItems: ['medium'],
  alwaysIncludeVariantIds: [101], // sold variant (already covered by pillow key, but must not duplicate)
})

const ids = scoped.map((m) => Number(m.shopify_variant_id)).sort((a, b) => a - b)
assert.deepEqual(ids, [101, 102, 201], 'should include shared-BOM siblings, not whole catalog')

// Part-only depletion: only that part mapping (+ always-include).
const partOnly = selectMappingsAffectedByDepletedItems({
  mappings,
  depletedItemIds: [10],
  pillowKeysUsingItems: [],
  bolsterVariantsUsingItems: [],
  alwaysIncludeVariantIds: [301],
})
assert.deepEqual(
  partOnly.map((m) => Number(m.shopify_variant_id)),
  [301],
  'part sale should not pull unrelated pillows',
)

// Always-include alone (no depleted items) still pushes the sold variant.
const alwaysOnly = selectMappingsAffectedByDepletedItems({
  mappings,
  depletedItemIds: [],
  pillowKeysUsingItems: [],
  bolsterVariantsUsingItems: [],
  alwaysIncludeVariantIds: [103],
})
assert.deepEqual(
  alwaysOnly.map((m) => Number(m.shopify_variant_id)),
  [103],
)

// Empty inputs → empty scope (full sync must not be implied).
const empty = selectMappingsAffectedByDepletedItems({
  mappings,
  depletedItemIds: [],
  pillowKeysUsingItems: [],
  bolsterVariantsUsingItems: [],
})
assert.equal(empty.length, 0)

// Catalog size vs scoped size — the whole point of the 84s fix.
assert.ok(mappings.length >= 8)
assert.ok(scoped.length < mappings.length / 2, 'scoped set must be much smaller than full catalog')

// Timing model: old path ~650ms * N; new path paces 0 and N_scoped << N.
const OLD_PACE_MS = 650
const fullCatalogMs = mappings.length * OLD_PACE_MS
const scopedMs = scoped.length * 50 // generous per-request budget without fixed sleep
assert.ok(scopedMs < fullCatalogMs / 10, `scoped work ${scopedMs}ms should be << full ${fullCatalogMs}ms`)

console.log('sync-scope.check.ts ok', {
  catalog: mappings.length,
  scoped: scoped.length,
  estimatedFullMs: fullCatalogMs,
  estimatedScopedMs: scopedMs,
})
