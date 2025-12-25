import { supabaseAdmin } from '@/lib/supabase/server'
import { shopifyGetPrimaryLocationId, shopifyGetVariantInventoryItemId, shopifySetInventoryLevel } from './client'
import { shopifyListActiveProductsWithVariants } from './products'

type MappingRow = {
  shopify_variant_id: number | string
  kind: 'pillow' | 'bolster' | 'part'
  pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | null
  bolster_variant: 'short' | 'medium' | 'long' | null
  item_id: number | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function syncShopifyInventoryFromBuildable(): Promise<{ updated: number }> {
  const admin = supabaseAdmin()

  const [{ data: mappings }, { data: pillowBuildableRows }, { data: balancesRows }, { data: bolsterBomRows }, activeProducts] = await Promise.all([
    admin
      .from('shopify_variant_mappings')
      .select('shopify_variant_id,kind,pillow_size,bolster_variant,item_id'),
    admin.from('product_buildable').select('size,buildable'),
    admin.from('inventory_balances').select('item_id,on_hand'),
    admin.from('bolster_bom_lines').select('variant,item_id,quantity'),
    shopifyListActiveProductsWithVariants({ limit: 250 }),
  ])

  const pillowBuildable: Record<string, number> = {}
  ;(pillowBuildableRows ?? []).forEach((r: { size: string; buildable: number | string }) => {
    pillowBuildable[String(r.size)] = Number(r.buildable)
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
    const counts = lines.map(l => Math.floor((balances[l.item_id] ?? 0) / Math.max(1, l.quantity)))
    return counts.length ? Math.max(0, Math.min(...counts)) : 0
  }
  const bolsterBuildable = {
    short: computeBolster('short'),
    medium: computeBolster('medium'),
    long: computeBolster('long'),
  }

  const locationId = await shopifyGetPrimaryLocationId()
  const inventoryItemIdCache = new Map<string, string>()

  // Prefetch variant_id -> inventory_item_id from active products to reduce API calls.
  for (const p of activeProducts ?? []) {
    for (const v of p.variants ?? []) {
      const vid = v.id
      const iid = (v as { inventory_item_id?: number }).inventory_item_id
      if (vid && iid) inventoryItemIdCache.set(String(vid), String(iid))
    }
  }

  let updated = 0
  for (const m of (mappings ?? []) as unknown as MappingRow[]) {
    const variantId = String(m.shopify_variant_id)

    let available = 0
    if (m.kind === 'pillow' && m.pillow_size) available = pillowBuildable[m.pillow_size] ?? 0
    else if (m.kind === 'bolster' && m.bolster_variant) available = bolsterBuildable[m.bolster_variant] ?? 0
    else if (m.kind === 'part' && m.item_id) available = balances[m.item_id] ?? 0

    let inventoryItemId = inventoryItemIdCache.get(variantId)
    if (!inventoryItemId) {
      inventoryItemId = await shopifyGetVariantInventoryItemId(variantId)
      inventoryItemIdCache.set(variantId, inventoryItemId)
    }

    // Shopify REST rate limit: keep this under ~2 req/sec to avoid 429.
    await sleep(650)
    await shopifySetInventoryLevel({ locationId, inventoryItemId, available })
    updated += 1
  }

  return { updated }
}


