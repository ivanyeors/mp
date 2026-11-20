export const PART_CATEGORY_LOW_STOCK_RATIO = 0.3

export type BomLine = { item_id: number; quantity: number }

export function isCategoryBottleneckLow(
  fromC: number,
  withoutC: number,
  hasCategoryLines: boolean,
): boolean {
  if (!hasCategoryLines) return false
  if (withoutC <= 0) return fromC <= 0
  return fromC / withoutC <= PART_CATEGORY_LOW_STOCK_RATIO
}

export function splitBomByCategory(
  lines: BomLine[],
  category: string,
  categoryOfItem: (itemId: number) => string | undefined,
): { inCategory: BomLine[]; outside: BomLine[] } {
  const inCategory: BomLine[] = []
  const outside: BomLine[] = []
  for (const line of lines) {
    if (categoryOfItem(line.item_id) === category) inCategory.push(line)
    else outside.push(line)
  }
  return { inCategory, outside }
}

export function collectLowStockCategories(args: {
  categories: readonly string[]
  boms: BomLine[][]
  categoryOfItem: (itemId: number) => string | undefined
  buildableFromLines: (lines: BomLine[]) => number
}): Set<string> {
  const low = new Set<string>()
  for (const category of args.categories) {
    for (const bom of args.boms) {
      if (!bom.length) continue
      const { inCategory, outside } = splitBomByCategory(bom, category, args.categoryOfItem)
      const fromC = args.buildableFromLines(inCategory)
      const withoutC = args.buildableFromLines(outside)
      if (isCategoryBottleneckLow(fromC, withoutC, inCategory.length > 0)) {
        low.add(category)
        break
      }
    }
  }
  return low
}
