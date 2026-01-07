import { supabaseAdmin } from '@/lib/supabase/server'
import { shopifyUpdateVariant } from './client'
import { shopifyListActiveProductsWithVariants } from './products'

type MappingRow = {
  shopify_variant_id: number | string
  kind: 'pillow' | 'bolster' | 'part'
  pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | null
  pillow_kind: 'basic' | 'premium' | null
  bolster_variant: 'short' | 'medium' | 'long' | null
  item_id: number | null
}

type OverrideRow = {
  shopify_variant_id: number | string
  sku: string | null
  price: number | string | null
  compare_at_price: number | string | null
  currency: string | null
}

type ProductPriceRow = {
  key: string
  msrp: number | string | null
  currency: string | null
}

type ItemPriceRow = {
  item_id: number | string
  msrp: number | string | null
  currency: string | null
}

type PillowProductRow = {
  id: number | string
  kind: 'basic' | 'premium' | string
  size: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toMoneyString(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const num = typeof v === 'number' ? v : Number.parseFloat(String(v))
  if (!Number.isFinite(num) || num < 0) return null
  return num.toFixed(2)
}

function detectPremiumVariantFromTitle(title: string | null): 'linen' | 'fibrecool' {
  const t = String(title || '').toLowerCase()
  if (t.includes('fibrecool')) return 'fibrecool'
  // default (most premium variants are linen colors)
  return 'linen'
}

export async function syncShopifyPricingFromSupabase(): Promise<{
  updated: number
  skipped: number
  skipped_not_found: number
  skipped_inactive: number
}> {
  const admin = supabaseAdmin()

  const [
    { data: mappings },
    { data: overrides },
    { data: productPrices },
    { data: itemPrices },
    { data: pillowProducts },
    activeProducts,
  ] = await Promise.all([
    admin
      .from('shopify_variant_mappings')
      .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id'),
    admin.from('shopify_variant_overrides').select('shopify_variant_id,sku,price,compare_at_price,currency'),
    admin.from('product_prices').select('key,msrp,currency'),
    admin.from('item_prices').select('item_id,msrp,currency'),
    admin.from('pillow_products').select('id,kind,size'),
    shopifyListActiveProductsWithVariants({ limit: 250 }),
  ])

  const overrideByVariantId = new Map<string, OverrideRow>()
  ;(overrides ?? []).forEach((o: OverrideRow) => {
    overrideByVariantId.set(String(o.shopify_variant_id), o)
  })

  const productPriceByKey = new Map<string, ProductPriceRow>()
  ;(productPrices ?? []).forEach((p: ProductPriceRow) => {
    productPriceByKey.set(String(p.key), p)
  })

  const itemMsrpByItemId = new Map<number, ItemPriceRow>()
  ;(itemPrices ?? []).forEach((r: ItemPriceRow) => {
    itemMsrpByItemId.set(Number(r.item_id), r)
  })

  const pillowProductIdByKindSize = new Map<string, number>()
  ;(pillowProducts ?? []).forEach((p: PillowProductRow) => {
    const k = String(p.kind || 'basic')
    const size = String(p.size)
    if (!k || !size) return
    pillowProductIdByKindSize.set(`${k}:${size}`, Number(p.id))
  })

  // Map variantId -> variant title from active Shopify products (to detect premium linen vs fibrecool).
  const shopifyVariantTitleById = new Map<string, string>()
  for (const p of activeProducts ?? []) {
    for (const v of p.variants ?? []) {
      shopifyVariantTitleById.set(String(v.id), String(v.title ?? ''))
    }
  }
  const activeVariantIds = new Set<string>(Array.from(shopifyVariantTitleById.keys()))

  let updated = 0
  let skipped = 0
  let skipped_not_found = 0
  let skipped_inactive = 0

  for (const m of (mappings ?? []) as unknown as MappingRow[]) {
    const variantId = String(m.shopify_variant_id)
    const ov = overrideByVariantId.get(variantId) ?? null

    // User preference: manage only active Shopify SKUs.
    if (activeVariantIds.size && !activeVariantIds.has(variantId)) {
      skipped_inactive += 1
      continue
    }

    // Compute desired price if not overridden.
    let desiredPrice: string | null | undefined = undefined
    let desiredCompareAt: string | null | undefined = undefined
    let desiredSku: string | null | undefined = undefined

    if (ov) {
      // UX: "Price" is managed from Costings (product_prices/item_prices) as the single source of truth.
      // Keep SKU + compare-at as editable overrides.
      if (ov.compare_at_price !== undefined) desiredCompareAt = toMoneyString(ov.compare_at_price)
      if (ov.sku !== undefined) desiredSku = ov.sku ? String(ov.sku) : null
    }

    if (desiredPrice === undefined) {
      if (m.kind === 'part' && m.item_id) {
        desiredPrice = toMoneyString(itemMsrpByItemId.get(Number(m.item_id))?.msrp ?? null)
      } else if (m.kind === 'bolster' && m.bolster_variant) {
        const key = `product:bolster:${m.bolster_variant}`
        desiredPrice = toMoneyString(productPriceByKey.get(key)?.msrp ?? null)
      } else if (m.kind === 'pillow' && m.pillow_size) {
        const pk = (m.pillow_kind ?? 'basic') as 'basic' | 'premium'
        const pillowProductId = pillowProductIdByKindSize.get(`${pk}:${m.pillow_size}`) ?? null
        if (pillowProductId) {
          if (pk === 'premium') {
            const title = shopifyVariantTitleById.get(variantId) ?? ''
            const premiumVariant = detectPremiumVariantFromTitle(title)
            const key = `product:pillow:${pillowProductId}:${premiumVariant}`
            desiredPrice = toMoneyString(productPriceByKey.get(key)?.msrp ?? null)
          } else {
            const key = `product:pillow:${pillowProductId}`
            desiredPrice = toMoneyString(productPriceByKey.get(key)?.msrp ?? null)
          }
        } else {
          desiredPrice = null
        }
      }
    }

    const patch: { price?: string | null; compareAtPrice?: string | null; sku?: string | null } = {}
    if (desiredPrice !== undefined && desiredPrice !== null) patch.price = desiredPrice
    if (desiredCompareAt !== undefined) patch.compareAtPrice = desiredCompareAt
    if (desiredSku !== undefined) patch.sku = desiredSku

    if (Object.keys(patch).length === 0) {
      skipped += 1
      continue
    }

    try {
      // Shopify REST rate limit: keep this under ~2 req/sec to avoid 429.
      await sleep(650)
      await shopifyUpdateVariant({ variantId, ...patch })
      updated += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Shopify API 404')) {
        skipped_not_found += 1
        console.warn('[shopify-prices] skipping missing variant', { variantId, kind: m.kind })
        continue
      }
      throw e
    }
  }

  return { updated, skipped, skipped_not_found, skipped_inactive }
}


