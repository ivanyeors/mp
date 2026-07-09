import { supabaseAdmin } from '@/lib/supabase/server'
import { shopifyGetPrimaryLocationId, shopifyGetVariantInventoryItemId, shopifySetInventoryLevel } from './client'
import { shopifyListActiveProductsWithVariants } from './products'
import { selectMappingsAffectedByDepletedItems, type ShopifyMappingRow } from './sync-scope'

type MappingRow = ShopifyMappingRow

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type AvailabilityContext = {
  pillowBuildable: Record<string, number>
  balances: Record<number, number>
  bolsterBuildable: Record<'short' | 'medium' | 'long', number>
}

function availableForMapping(m: MappingRow, ctx: AvailabilityContext): number {
  if (m.kind === 'pillow' && m.pillow_size) {
    const pk = (m.pillow_kind ?? 'basic') as 'basic' | 'premium'
    return ctx.pillowBuildable[`${pk}:${m.pillow_size}`] ?? 0
  }
  if (m.kind === 'bolster' && m.bolster_variant) {
    return ctx.bolsterBuildable[m.bolster_variant as 'short' | 'medium' | 'long'] ?? 0
  }
  if (m.kind === 'part' && m.item_id) return ctx.balances[m.item_id] ?? 0
  return 0
}

async function loadAvailabilityContext(admin: ReturnType<typeof supabaseAdmin>): Promise<AvailabilityContext> {
  const [{ data: pillowBuildableRows }, { data: balancesRows }, { data: bolsterBomRows }] = await Promise.all([
    admin.from('product_buildable').select('kind,size,buildable'),
    admin.from('inventory_balances').select('item_id,on_hand'),
    admin.from('bolster_bom_lines').select('variant,item_id,quantity'),
  ])

  const pillowBuildable: Record<string, number> = {}
  ;(pillowBuildableRows ?? []).forEach((r: { kind: string; size: string; buildable: number | string }) => {
    const k = String(r.kind || 'basic')
    const s = String(r.size)
    pillowBuildable[`${k}:${s}`] = Number(r.buildable)
  })

  const balances: Record<number, number> = {}
  ;(balancesRows ?? []).forEach((r: { item_id: number | string; on_hand: number | string }) => {
    balances[Number(r.item_id)] = Number(r.on_hand)
  })

  const bolsterLinesByVariant: Record<'short' | 'medium' | 'long', Array<{ item_id: number; quantity: number }>> = {
    short: [],
    medium: [],
    long: [],
  }
  ;(bolsterBomRows ?? []).forEach((r: { variant: string; item_id: number | string; quantity: number | string }) => {
    const v = String(r.variant) as 'short' | 'medium' | 'long'
    if (!['short', 'medium', 'long'].includes(v)) return
    bolsterLinesByVariant[v].push({ item_id: Number(r.item_id), quantity: Math.max(1, Number(r.quantity)) })
  })

  const computeBolster = (variant: 'short' | 'medium' | 'long') => {
    const lines = bolsterLinesByVariant[variant]
    if (!lines.length) return 0
    const counts = lines.map((l) => Math.floor((balances[l.item_id] ?? 0) / Math.max(1, l.quantity)))
    return counts.length ? Math.max(0, Math.min(...counts)) : 0
  }

  return {
    pillowBuildable,
    balances,
    bolsterBuildable: {
      short: computeBolster('short'),
      medium: computeBolster('medium'),
      long: computeBolster('long'),
    },
  }
}

async function pushMappingsToShopify(args: {
  mappings: MappingRow[]
  paceMs?: number
}): Promise<{ updated: number; skipped_not_found: number; skipped_inactive: number }> {
  if (!args.mappings.length) return { updated: 0, skipped_not_found: 0, skipped_inactive: 0 }

  const admin = supabaseAdmin()
  const [ctx, activeProducts, locationId] = await Promise.all([
    loadAvailabilityContext(admin),
    shopifyListActiveProductsWithVariants({ limit: 250 }),
    shopifyGetPrimaryLocationId(),
  ])

  const inventoryItemIdCache = new Map<string, string>()
  const activeVariantIds = new Set<string>()

  for (const p of activeProducts ?? []) {
    for (const v of p.variants ?? []) {
      const vid = v.id
      const iid = (v as { inventory_item_id?: number }).inventory_item_id
      if (vid) activeVariantIds.add(String(vid))
      if (vid && iid) inventoryItemIdCache.set(String(vid), String(iid))
    }
  }

  let updated = 0
  let skipped_not_found = 0
  let skipped_inactive = 0
  const paceMs = args.paceMs ?? 0

  for (const m of args.mappings) {
    const variantId = String(m.shopify_variant_id)

    if (activeVariantIds.size && !activeVariantIds.has(variantId)) {
      skipped_inactive += 1
      continue
    }

    const available = availableForMapping(m, ctx)

    try {
      let inventoryItemId = inventoryItemIdCache.get(variantId)
      if (!inventoryItemId) {
        inventoryItemId = await shopifyGetVariantInventoryItemId(variantId)
        inventoryItemIdCache.set(variantId, inventoryItemId)
      }

      // Full-catalog sync paces to stay under ~2 req/sec. Scoped sync relies on 429 retry.
      if (paceMs > 0) await sleep(paceMs)
      await shopifySetInventoryLevel({ locationId, inventoryItemId, available })
      updated += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Shopify API 404')) {
        skipped_not_found += 1
        console.warn('[shopify-sync] skipping missing variant', {
          variantId,
          kind: m.kind,
          pillow_size: m.pillow_size,
          pillow_kind: m.pillow_kind,
          bolster_variant: m.bolster_variant,
          item_id: m.item_id,
          inActiveList: activeVariantIds.has(variantId),
        })
        continue
      }
      throw e
    }
  }

  return { updated, skipped_not_found, skipped_inactive }
}

export async function syncShopifyInventoryFromBuildable(): Promise<{
  updated: number
  skipped_not_found: number
  skipped_inactive: number
}> {
  const admin = supabaseAdmin()
  const { data: mappings } = await admin
    .from('shopify_variant_mappings')
    .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id')

  return pushMappingsToShopify({
    mappings: (mappings ?? []) as MappingRow[],
    paceMs: 650,
  })
}

/**
 * Push inventory for mappings affected by depleted item ids (BOM-aware).
 * No fixed sleep — small batches; client 429 retry handles bursts.
 */
export async function syncShopifyInventoryForDepletedItems(args: {
  depletedItemIds: number[]
  alwaysIncludeVariantIds?: number[]
  /** Extra pillow keys from the committed sale rows (kind+size) */
  pillowKeys?: Array<{ kind: string; size: string }>
  /** Extra bolster variants from the committed sale rows */
  bolsterVariants?: string[]
}): Promise<{ updated: number; skipped_not_found: number; skipped_inactive: number; scoped: number }> {
  const depleted = Array.from(
    new Set(args.depletedItemIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)),
  )
  const always = Array.from(
    new Set((args.alwaysIncludeVariantIds ?? []).map(Number).filter((id) => Number.isFinite(id) && id > 0)),
  )
  if (!depleted.length && !always.length && !(args.pillowKeys?.length) && !(args.bolsterVariants?.length)) {
    return { updated: 0, skipped_not_found: 0, skipped_inactive: 0, scoped: 0 }
  }

  const admin = supabaseAdmin()

  const [{ data: mappings }, { data: pillowProducts }, { data: bomLines }, { data: bolsterBom }] = await Promise.all([
    admin
      .from('shopify_variant_mappings')
      .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id'),
    admin.from('pillow_products').select('id,kind,size').eq('is_active', true),
    depleted.length
      ? admin.from('bom_lines').select('product_id,item_id').in('item_id', depleted)
      : Promise.resolve({ data: [] as Array<{ product_id: number; item_id: number }> }),
    depleted.length
      ? admin.from('bolster_bom_lines').select('variant,item_id').in('item_id', depleted)
      : Promise.resolve({ data: [] as Array<{ variant: string; item_id: number }> }),
  ])

  const productIdByKey = new Map<number, { kind: string; size: string }>()
  ;(pillowProducts ?? []).forEach((p: { id: number | string; kind: string | null; size: string }) => {
    productIdByKey.set(Number(p.id), { kind: String(p.kind || 'basic'), size: String(p.size) })
  })

  const pillowKeysUsingItems: Array<{ kind: string; size: string }> = [...(args.pillowKeys ?? [])]
  const seenPillow = new Set(pillowKeysUsingItems.map((p) => `${p.kind}:${p.size}`))
  ;(bomLines ?? []).forEach((r: { product_id: number | string }) => {
    const meta = productIdByKey.get(Number(r.product_id))
    if (!meta) return
    const k = `${meta.kind}:${meta.size}`
    if (seenPillow.has(k)) return
    seenPillow.add(k)
    pillowKeysUsingItems.push(meta)
  })

  const bolsterVariantsUsingItems = Array.from(
    new Set([
      ...(args.bolsterVariants ?? []).map(String),
      ...(bolsterBom ?? []).map((r: { variant: string }) => String(r.variant)),
    ]),
  )

  const scoped = selectMappingsAffectedByDepletedItems({
    mappings: (mappings ?? []) as MappingRow[],
    depletedItemIds: depleted,
    pillowKeysUsingItems,
    bolsterVariantsUsingItems,
    alwaysIncludeVariantIds: always,
  })

  const result = await pushMappingsToShopify({ mappings: scoped, paceMs: 0 })
  return { ...result, scoped: scoped.length }
}
