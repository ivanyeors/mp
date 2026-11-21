import assert from 'node:assert/strict'
import {
  collectLowStockCategories,
  isCategoryBottleneckLow,
  type BomLine,
} from './part-category-low-stock'

assert.equal(isCategoryBottleneckLow(30, 100, true), true)
assert.equal(isCategoryBottleneckLow(50, 100, true), false)
assert.equal(isCategoryBottleneckLow(0, 100, true), true)
assert.equal(isCategoryBottleneckLow(0, 0, true), true)
assert.equal(isCategoryBottleneckLow(40, 0, true), false)
assert.equal(isCategoryBottleneckLow(0, 100, false), false)

const onHand: Record<number, number> = { 1: 30, 2: 100, 3: 100 }
const buildFrom = (lines: BomLine[]) => {
  if (!lines.length) return 0
  return Math.min(
    ...lines.map((l) => Math.floor((onHand[l.item_id] ?? 0) / Math.max(1, l.quantity))),
  )
}

const catOf = (id: number) => (id === 1 ? 'cover' : id === 2 ? 'filling' : 'packaging')
const bom: BomLine[] = [
  { item_id: 1, quantity: 1 },
  { item_id: 2, quantity: 1 },
  { item_id: 3, quantity: 1 },
]

const low = collectLowStockCategories({
  categories: ['cover', 'filling', 'packaging'],
  boms: [bom],
  categoryOfItem: catOf,
  buildableFromLines: buildFrom,
})
assert.ok(low.has('cover'), 'cover at 30/100 should be low')
assert.ok(!low.has('filling'), 'filling at 100/30 baseline side should not be low as category')
assert.ok(!low.has('packaging'))

const lowUnused = collectLowStockCategories({
  categories: ['accessories'],
  boms: [bom],
  categoryOfItem: catOf,
  buildableFromLines: buildFrom,
})
assert.equal(lowUnused.size, 0)

console.log('part-category-low-stock.check.ts: ok')
