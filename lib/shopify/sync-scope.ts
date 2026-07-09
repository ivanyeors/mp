/**
 * Pure helpers: which Shopify mappings must be updated after depleting inventory items.
 * Shared BOM means one sale can change many buildables — not just the sold variant.
 */

export type ShopifyMappingRow = {
  shopify_variant_id: number | string
  kind: 'pillow' | 'bolster' | 'part'
  pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | string | null
  pillow_kind: 'basic' | 'premium' | string | null
  bolster_variant: 'short' | 'medium' | 'long' | string | null
  item_id: number | null
}

export function selectMappingsAffectedByDepletedItems(args: {
  mappings: ShopifyMappingRow[]
  depletedItemIds: Iterable<number>
  /** Pillow products (kind+size) whose default BOM uses any depleted item */
  pillowKeysUsingItems: Array<{ kind: string; size: string }>
  /** Bolster variants whose BOM uses any depleted item */
  bolsterVariantsUsingItems: Array<string>
  /** Always push these variant ids (e.g. the sold queue row's Shopify variant) */
  alwaysIncludeVariantIds?: Iterable<number>
}): ShopifyMappingRow[] {
  const depleted = new Set(
    Array.from(args.depletedItemIds)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )
  const always = new Set(
    Array.from(args.alwaysIncludeVariantIds ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )
  const pillowKeys = new Set(
    args.pillowKeysUsingItems.map((p) => `${String(p.kind || 'basic')}:${String(p.size)}`),
  )
  const bolsterVariants = new Set(args.bolsterVariantsUsingItems.map(String))

  const out: ShopifyMappingRow[] = []
  const seen = new Set<string>()

  for (const m of args.mappings) {
    const variantId = Number(m.shopify_variant_id)
    const key = String(m.shopify_variant_id)
    if (seen.has(key)) continue

    let include = always.has(variantId)
    if (!include && m.kind === 'part' && m.item_id != null && depleted.has(Number(m.item_id))) {
      include = true
    }
    if (!include && m.kind === 'pillow' && m.pillow_size) {
      const pk = String(m.pillow_kind || 'basic')
      if (pillowKeys.has(`${pk}:${m.pillow_size}`)) include = true
    }
    if (!include && m.kind === 'bolster' && m.bolster_variant) {
      if (bolsterVariants.has(String(m.bolster_variant))) include = true
    }

    if (include) {
      seen.add(key)
      out.push(m)
    }
  }

  return out
}
