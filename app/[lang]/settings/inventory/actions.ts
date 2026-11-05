"use server";

import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'
import { assertAdmin, assertAnyAdmin } from '@/lib/auth/admin'
import { loadTemplateKeys, templateIdsForKey } from '@/lib/filling-templates/membership'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'
import { syncShopifyPricingFromSupabase } from '@/lib/shopify/pricing'
import { shopifyListActiveProductsWithVariants } from '@/lib/shopify/products'
import { combineTemplateSaleLines } from '@/lib/inventory/template-sale-lines'
import { loadFillingTemplatePack } from '@/lib/filling-templates/pack'
import { alterationBaseId, assertConvertible, stockInRows, type StockItem } from '@/lib/inventory/alteration-stock'
import { reResolveShopifyLineCosts } from '@/lib/shopify/order-mirror-ingest'
import { setProductBaseImage, syncItemImageToProducts } from '@/lib/ecommerce/item-image-sync'
import { resolveAddonImageUrls } from '@/lib/results/addon-images'
import { listInventoryFamilies } from '@/lib/ecommerce/shop-listings'
import { toCents, type CostingPrices, type InventoryFamily } from '@/lib/ecommerce/inventory-families'

function scheduleMirrorReResolve(variantIds: number[]) {
  after(() => {
    void reResolveShopifyLineCosts({ variantIds }).catch((err) => {
      console.error('[shopify-mirror] re-resolve failed', err)
    })
  })
}

const ItemQtySchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})
const DeleteItemSchema = z.object({ itemId: z.number().int().positive() })
const RenameItemSchema = z.object({
  itemId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Name is required').max(120),
})
const SellFromTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  fillingTemplateId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})

const SellCartSchema = z.object({
  /** One per cart. Selling the same cart again (a double click, a retry after a timeout) sells nothing twice. */
  saleId: z.string().uuid(),
  builds: z.array(SellFromTemplateSchema).default([]),
  parts: z.array(ItemQtySchema).default([]),
}).refine((c) => c.builds.length + c.parts.length > 0, { message: 'Cart is empty' })

const ITEM_CATEGORIES = [
  'cover',
  'pillow_case',
  'pillow_protector',
  'bolster_case',
  'bolster_protector',
  'filling',
  'packaging',
  'accessories',
  'other',
] as const
const CategoryEnum = z.enum(ITEM_CATEGORIES)

const AddItemSchema = z.object({
  category: CategoryEnum,
  name: z.string().trim().min(1, 'Name is required').max(120),
  size: z.string().trim().min(1, 'Size must not be empty').max(60).optional(),
  subtype: z.string().trim().min(1, 'Subtype must not be empty').max(120).optional(),
  alterationOfItemId: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number.parseInt(String(v).trim(), 10)
      if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid alteration item ID')
      return n
    })
    .optional(),
  alterationName: z.string().trim().max(120).optional(),
  initialStock: z.number().int().min(0).default(0),
  costPrice: z.number().min(0).optional(),
  msrp: z.number().min(0).optional(),
}).superRefine((value, ctx) => {
  const normalizedSize = value.size?.trim()
  // Fillings are product-agnostic (size optional). Covers/cases/protectors are sized.
  if (
    ['cover', 'pillow_case', 'pillow_protector', 'bolster_case', 'bolster_protector'].includes(value.category)
    && (!normalizedSize || normalizedSize === '-')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Size is required for covers, cases, and protectors',
      path: ['size'],
    })
  }

  if (value.alterationOfItemId !== undefined) {
    if (value.category !== 'filling') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alterations are only supported for filling items',
        path: ['alterationOfItemId'],
      })
    }
    if (!normalizedSize || normalizedSize === '-') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Size is required when creating an altered filling',
        path: ['size'],
      })
    }
  }
})

const ShopifyVariantIdSchema = z.union([z.string(), z.number()]).transform((v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v).trim(), 10)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid Shopify variant ID')
  return n
})

const UpsertShopifyOverrideSchema = z.object({
  shopifyVariantId: ShopifyVariantIdSchema,
  sku: z.string().trim().max(120).nullable().optional(),
  price: z.number().min(0).nullable().optional(),
  compareAtPrice: z.number().min(0).nullable().optional(),
})

const LinkPartMappingSchema = z.object({
  shopifyVariantId: ShopifyVariantIdSchema,
  itemId: z.number().int().positive(),
})

const LinkPillowMappingSchema = z.object({
  shopifyVariantId: ShopifyVariantIdSchema,
  pillowKind: z.enum(['basic', 'premium']).default('basic'),
  pillowSize: z.enum(['XS', 'S', 'M', 'L', 'XL']),
  templateId: z.number().int().positive().nullable().optional(),
})

const LinkBolsterMappingSchema = z.object({
  shopifyVariantId: ShopifyVariantIdSchema,
  bolsterVariant: z.enum(['short', 'medium', 'long']).default('medium'),
  templateId: z.number().int().positive().nullable().optional(),
})

export async function sellPart(input: z.infer<typeof ItemQtySchema>) {
  await assertAdmin('inventory')
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const { error } = await admin.from('inventory_transactions').insert({
    item_id: parsed.itemId,
    quantity_signed: -parsed.quantity,
    reason: 'sale',
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function receiveStock(input: z.infer<typeof ItemQtySchema>) {
  await assertAdmin('inventory')
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const { data: item, error: itemErr } = await admin
    .from('items')
    .select('id,category,alteration_of_item_id')
    .eq('id', parsed.itemId)
    .maybeSingle()
  if (itemErr) throw new Error(itemErr.message)
  if (!item) throw new Error('Item not found')

  await insertStockIn(admin, item, parsed.quantity)
  return { ok: true }
}

async function onHandOf(admin: ReturnType<typeof supabaseAdmin>, itemId: number) {
  const { data, error } = await admin.from('inventory_balances').select('on_hand').eq('item_id', itemId).maybeSingle()
  if (error) throw new Error(error.message)
  return Number(data?.on_hand ?? 0)
}

/**
 * Receiving an altered filling converts it out of its base filling, refusing to
 * take the base below zero.
 * ponytail: read-then-insert, so two conversions from the same base at the same
 * instant can both pass and overdraw it. Move into a Postgres function holding
 * pg_advisory_xact_lock(base id) if concurrent staff conversions ever happen.
 */
async function insertStockIn(admin: ReturnType<typeof supabaseAdmin>, item: StockItem, quantity: number) {
  const baseId = alterationBaseId(item)
  const baseOnHand = baseId === null ? 0 : await onHandOf(admin, baseId)
  const { error } = await admin.from('inventory_transactions').insert(stockInRows(item, quantity, baseOnHand))
  if (error) throw new Error(error.message)
}

export async function setThreshold(itemId: number, minLevel: number) {
  await assertAdmin('inventory')
  const admin = supabaseAdmin()
  const { error } = await admin.from('item_thresholds').upsert({ item_id: itemId, min_level: minLevel })
  if (error) throw new Error(error.message)
  return { ok: true }
}

/**
 * One build's sale rows: a Warehouse Template's lines plus a Filling Template's
 * pack, aggregated per Item. The pack comes from its placements when it has
 * them, as a Result's fillings do (`loadFillingTemplatePack`).
 */
async function templateBuildSaleRows(
  admin: ReturnType<typeof supabaseAdmin>,
  build: z.infer<typeof SellFromTemplateSchema>,
) {
  const { data: template, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,role')
    .eq('id', build.templateId)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!template) throw new Error('Template not found')
  if (template.role !== 'warehouse') throw new Error('Template must be a warehouse template')

  const { data: fillingTemplate, error: fErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,role')
    .eq('id', build.fillingTemplateId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!fillingTemplate) throw new Error('Filling template not found')
  if (fillingTemplate.role !== 'filling') throw new Error('Filling template must have role=filling')
  const served = await loadTemplateKeys(admin, [Number(fillingTemplate.id)])
  if (!served.ok) throw new Error(served.error)
  const keys = served.byId.get(Number(fillingTemplate.id)) ?? [fillingTemplate.key]
  if (fillingTemplate.kind !== template.kind || !keys.includes(template.key)) {
    throw new Error('Filling template does not match product size/length')
  }

  const [{ data: warehouseLines, error: wErr }, fillingLines] = await Promise.all([
    admin.from('bom_template_lines').select('item_id,quantity').eq('template_id', build.templateId),
    loadFillingTemplatePack(admin, build.fillingTemplateId),
  ])
  if (wErr) throw new Error(wErr.message)
  if (!warehouseLines?.length) throw new Error('Warehouse template has no lines')
  if (!fillingLines.length) throw new Error(`Filling template "${fillingTemplate.name}" has no fillings`)

  const combined = combineTemplateSaleLines(
    warehouseLines.map((l: { item_id: number | string; quantity: number | string }) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
    })),
    fillingLines,
    build.quantity,
  )
  const metadata = {
    template_id: build.templateId,
    template_kind: template.kind,
    template_key: template.key,
    template_name: template.name,
    filling_template_id: build.fillingTemplateId,
    filling_template_name: fillingTemplate.name,
  }
  return combined.map((t) => ({ ...t, metadata }))
}

/**
 * Sell an in-store cart: every build and part in one ledger insert, so the cart
 * sells whole or not at all. Each row carries the cart's `sale_id` and its line,
 * and a unique index on them refuses a second insert of the same cart: a resubmit
 * answers "already sold" instead of deducting twice.
 */
export async function sellCart(input: z.input<typeof SellCartSchema>) {
  await assertAdmin('inventory')
  const parsed = SellCartSchema.parse(input)
  const admin = supabaseAdmin()

  const rows: Array<Record<string, unknown>> = []
  for (const [line, build] of parsed.builds.entries()) {
    for (const row of await templateBuildSaleRows(admin, build)) {
      rows.push({ ...row, reason: 'sale', metadata: { ...row.metadata, sale_id: parsed.saleId, sale_line: line } })
    }
  }
  parsed.parts.forEach((part, i) => {
    rows.push({
      item_id: part.itemId,
      quantity_signed: -part.quantity,
      reason: 'sale',
      metadata: { sale_id: parsed.saleId, sale_line: parsed.builds.length + i },
    })
  })

  const { error } = await admin.from('inventory_transactions').insert(rows)
  if (error) {
    if (error.code === '23505') return { ok: true, alreadySold: true }
    throw new Error(error.message)
  }
  return { ok: true, alreadySold: false }
}

export async function listTemplates(kind: 'pillow' | 'bolster', key: string, pillowKind?: 'basic' | 'premium', pillowVariant?: 'linen' | 'fibrecool') {
  await assertAnyAdmin(['inventory', 'shopify-link'])
  const admin = supabaseAdmin()
  const effectivePillowKind = kind === 'pillow' ? (pillowKind ?? 'basic') : null
  const effectivePillowVariant = kind === 'pillow' && effectivePillowKind === 'premium' ? (pillowVariant ?? null) : null

  let q = admin
    .from('bom_templates')
    .select('id,name,kind,key,pillow_kind,pillow_variant')
    .eq('kind', kind)
    .eq('key', key)
    .eq('role', 'warehouse')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (kind === 'pillow') {
    q = q.eq('pillow_kind', effectivePillowKind)
    // When pillowVariant is passed, filter; otherwise return all variants so UI can price by selection.
    if (effectivePillowKind === 'premium' && effectivePillowVariant) {
      q = q.eq('pillow_variant', effectivePillowVariant)
    }
  }
  else q = q.is('pillow_kind', null)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { ok: true, templates: data ?? [] }
}

export async function listFillingTemplates(kind: 'pillow' | 'bolster', key: string) {
  await assertAdmin('inventory')
  const admin = supabaseAdmin()
  // Membership, not `key`: the Default picker must offer recipes shared in from
  // another size, or a shared template could never be made a card's default.
  const members = await templateIdsForKey(admin, key)
  if (!members.ok) throw new Error(members.error)
  if (!members.ids.length) return { ok: true, templates: [] }
  const { data, error } = await admin
    .from('bom_templates')
    .select('id,name,kind,key')
    .eq('kind', kind)
    .eq('role', 'filling')
    .eq('is_active', true)
    .in('id', members.ids)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { ok: true, templates: data ?? [] }
}

export async function deleteInventoryItem(input: z.infer<typeof DeleteItemSchema>) {
  await assertAdmin('inventory')
  const parsed = DeleteItemSchema.parse(input)
  const admin = supabaseAdmin()

  const { data, error } = await admin
    .from('items')
    .update({ is_active: false })
    .eq('id', parsed.itemId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Item not found or already inactive')

  await admin.from('item_prices').delete().eq('item_id', parsed.itemId)

  return { ok: true }
}

export async function renameInventoryItem(input: z.infer<typeof RenameItemSchema>) {
  await assertAdmin('inventory')
  const parsed = RenameItemSchema.parse(input)
  const admin = supabaseAdmin()
  const normalizedName = parsed.name.trim()

  const { data, error } = await admin
    .from('items')
    .update({ name: normalizedName })
    .eq('id', parsed.itemId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      throw new Error('An item with the same category, size, subtype, and name already exists.')
    }
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Item not found or already inactive')
  }

  return { ok: true }
}

const ItemsImageSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
  assetId: z.string().uuid().nullable(),
})

/** Set one primary image on a group of Items (all sizes of a family); it becomes their shop products' base image. */
export async function setItemsPrimaryImage(input: z.infer<typeof ItemsImageSchema>) {
  await assertAdmin('inventory')
  const parsed = ItemsImageSchema.parse(input)
  const admin = supabaseAdmin()
  const { data: before, error: bErr } = await admin
    .from('items')
    .select('id, primary_media_asset_id')
    .in('id', parsed.itemIds)
    .eq('is_active', true)
  if (bErr) throw new Error(bErr.message)
  if (!before?.length) throw new Error('Items not found or already inactive')
  const { error } = await admin
    .from('items')
    .update({ primary_media_asset_id: parsed.assetId })
    .in('id', before.map((i) => i.id))
  if (error) throw new Error(error.message)
  // All items updated first so the sync replaces the shared old row in place.
  for (const it of before) {
    await syncItemImageToProducts(admin, it.id, it.primary_media_asset_id ?? null, parsed.assetId)
  }
  return { ok: true }
}

/** item_id → current primary image URL, for thumbnails on the inventory page. */
export async function getItemImageUrls(): Promise<Record<number, string>> {
  await assertAdmin('inventory')
  const admin = supabaseAdmin()
  const { data: items, error } = await admin
    .from('items')
    .select('id, primary_media_asset_id')
    .eq('is_active', true)
    .not('primary_media_asset_id', 'is', null)
  if (error) throw new Error(error.message)
  const assetIds = [...new Set((items ?? []).map((i) => i.primary_media_asset_id as string))]
  if (assetIds.length === 0) return {}
  const { data: assets, error: aErr } = await admin
    .from('media_assets')
    .select('id, kind, hosted_url')
    .in('id', assetIds)
  if (aErr) throw new Error(aErr.message)
  return Object.fromEntries(resolveAddonImageUrls(items ?? [], assets ?? []))
}

/**
 * Where each Item stands after Inventory: its Costings prices (so the page can
 * offer "Add cost" until it has them) and, for the families the shop can sell,
 * whether they have been pushed to Products.
 */
export async function getInventoryCostingState(): Promise<{
  prices: Record<number, CostingPrices>
  families: InventoryFamily[]
}> {
  await assertAdmin('inventory')
  const admin = supabaseAdmin()
  const [{ data, error }, families] = await Promise.all([
    admin.from('item_prices').select('item_id, cost_price, msrp'),
    listInventoryFamilies(),
  ])
  if (error) throw new Error(error.message)
  const prices: Record<number, CostingPrices> = {}
  for (const row of data ?? []) {
    prices[Number(row.item_id)] = { costCents: toCents(row.cost_price), msrpCents: toCents(row.msrp) }
  }
  return { prices, families }
}

const COMPOSED_PRODUCT_SLUGS = ['mpillow-basic', 'mpillow-premium', 'mbolster'] as const
export type ComposedProductSlug = (typeof COMPOSED_PRODUCT_SLUGS)[number]

const ComposedImageSchema = z.object({
  slug: z.enum(COMPOSED_PRODUCT_SLUGS),
  assetId: z.string().uuid().nullable(),
})

/** Set the base image of the basic / premium pillow or bolster storefront product. */
export async function setComposedProductImage(input: z.infer<typeof ComposedImageSchema>) {
  await assertAdmin('inventory')
  const parsed = ComposedImageSchema.parse(input)
  const admin = supabaseAdmin()
  const { data: product, error } = await admin
    .from('products')
    .select('id')
    .eq('slug', parsed.slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!product) throw new Error('Shop product not generated yet — run the product sync first')
  const url = await setProductBaseImage(admin, product.id, parsed.assetId)
  return { ok: true, url }
}

/** slug → current base image URL of the pillow/bolster storefront products. */
export async function getComposedProductImageUrls(): Promise<Partial<Record<ComposedProductSlug, string>>> {
  await assertAdmin('inventory')
  const { data, error } = await supabaseAdmin()
    .from('products')
    .select('slug, product_variants(image_url)')
    .in('slug', [...COMPOSED_PRODUCT_SLUGS])
  if (error) throw new Error(error.message)
  const out: Partial<Record<ComposedProductSlug, string>> = {}
  for (const p of data ?? []) {
    const url = (p.product_variants as Array<{ image_url: string | null }>).map((v) => v.image_url).find(Boolean)
    if (url) out[p.slug as ComposedProductSlug] = url
  }
  return out
}

export async function addInventoryItem(input: z.infer<typeof AddItemSchema>) {
  await assertAdmin('inventory')
  const parsed = AddItemSchema.parse(input)
  const admin = supabaseAdmin()

  const rawSize = parsed.size?.trim()
  const normalizedSize =
    rawSize && rawSize !== '-'
      ? (
        ['cover', 'pillow_case', 'pillow_protector', 'bolster_case', 'bolster_protector', 'filling'].includes(parsed.category)
          ? rawSize.toUpperCase()
          : rawSize
      )
      : null
  const normalizedSubtype = parsed.subtype?.trim() ? parsed.subtype.trim() : null
  const normalizedName = parsed.name
  const normalizedAlterationName = parsed.alterationName?.trim() ? parsed.alterationName.trim() : null

  if (parsed.alterationOfItemId !== undefined) {
    const { data: base, error: baseErr } = await admin
      .from('items')
      .select('id,category,size')
      .eq('id', parsed.alterationOfItemId)
      .eq('is_active', true)
      .maybeSingle()
    if (baseErr) throw new Error(baseErr.message)
    if (!base) throw new Error('Alteration base item not found')
    if (base.category !== 'filling') throw new Error('Alteration base must be a filling item')

    const baseSize = base.size === null || base.size === undefined ? null : String(base.size).trim().toUpperCase()
    const desiredSize = normalizedSize === null ? null : String(normalizedSize).trim().toUpperCase()
    if (!baseSize || !desiredSize || baseSize !== desiredSize) {
      throw new Error('Alteration base must have the same size')
    }

    // Initial stock converts out of the base — check before creating the item so a
    // refusal doesn't leave a stockless item behind.
    if (parsed.initialStock > 0) {
      assertConvertible(parsed.initialStock, await onHandOf(admin, parsed.alterationOfItemId))
    }
  }

  const toCurrencyString = (value: number | undefined) => {
    if (value === undefined) return null
    const cents = Math.round(value * 100)
    return (cents / 100).toFixed(2)
  }

  const { data: item, error: insertErr } = await admin
    .from('items')
    .insert({
      category: parsed.category,
      name: normalizedName,
      size: normalizedSize,
      subtype: normalizedSubtype,
      alteration_of_item_id: parsed.alterationOfItemId ?? null,
      alteration_name: normalizedAlterationName,
      is_active: true,
    })
    .select('id,category,name,size,subtype')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      // The unique index does not include is_active. This means a previously "deleted" (inactive) item
      // can block re-creating the same item. In that case, revive it instead of throwing.
      type ExistingItemRow = { id: number | string; is_active: boolean | null }
      let q = admin
        .from('items')
        .select('id,is_active')
        .eq('category', parsed.category)
        .eq('name', normalizedName)

      q = normalizedSize === null ? q.is('size', null) : q.eq('size', normalizedSize)
      q = normalizedSubtype === null ? q.is('subtype', null) : q.eq('subtype', normalizedSubtype)

      const { data: existing, error: existingErr } = await q.maybeSingle<ExistingItemRow>()
      if (existingErr) throw new Error(existingErr.message)

      if (existing && existing.is_active === false) {
        const { data: revived, error: reviveErr } = await admin
          .from('items')
          .update({
            is_active: true,
            // Keep alteration metadata aligned with the requested payload.
            alteration_of_item_id: parsed.alterationOfItemId ?? null,
            alteration_name: normalizedAlterationName,
          })
          .eq('id', Number(existing.id))
          .select('id,category,name,size,subtype')
          .single()
        if (reviveErr) throw new Error(reviveErr.message)

        const priceRow = {
          item_id: revived.id,
          cost_price: toCurrencyString(parsed.costPrice),
          msrp: toCurrencyString(parsed.msrp),
        }

        if (priceRow.cost_price !== null || priceRow.msrp !== null) {
          const { error: priceErr } = await admin.from('item_prices').upsert(priceRow)
          if (priceErr) throw new Error(priceErr.message)
        }

        if (parsed.initialStock > 0) {
          await insertStockIn(
            admin,
            { id: Number(revived.id), category: parsed.category, alteration_of_item_id: parsed.alterationOfItemId ?? null },
            parsed.initialStock,
          )
        }

        return { ok: true, item: revived }
      }

      throw new Error('An item with the same category, size, subtype, and name already exists.')
    }
    throw new Error(insertErr.message)
  }

  const priceRow = {
    item_id: item.id,
    cost_price: toCurrencyString(parsed.costPrice),
    msrp: toCurrencyString(parsed.msrp),
  }

  if (priceRow.cost_price !== null || priceRow.msrp !== null) {
    const { error: priceErr } = await admin.from('item_prices').upsert(priceRow)
    if (priceErr) throw new Error(priceErr.message)
  }

  if (parsed.initialStock > 0) {
    await insertStockIn(
      admin,
      { id: Number(item.id), category: parsed.category, alteration_of_item_id: parsed.alterationOfItemId ?? null },
      parsed.initialStock,
    )
  }

  return { ok: true, item }
}

export async function fullShopifySync() {
  await assertAdmin('shopify-link')
  const [inventory, prices] = await Promise.all([
    syncShopifyInventoryFromBuildable(),
    syncShopifyPricingFromSupabase(),
  ])
  return { ok: true, inventory, prices }
}

/**
 * Shape of the Shopify Admin API active-products payload, as far as the admin
 * panel needs it.
 */
type ShopifyActiveProduct = {
  title?: string
  variants?: Array<{ id: number; title?: string; sku?: string | null }>
}

/**
 * Builds the Shopify admin table from the database, optionally enriched with
 * the live Shopify active-products list.
 *
 * `activeProducts` is a parameter rather than a fetch so the Admin API call can
 * be kept off the page's first paint: {@link listShopifyAdminState} builds the
 * DB-only view for immediate render, and {@link listShopifyRemoteProducts}
 * rebuilds it once the remote list is in hand. Passing an empty list yields
 * exactly the mappings-only fallback this function already produced whenever
 * the Shopify env vars were missing.
 */
async function buildShopifyAdminState(activeProducts: ShopifyActiveProduct[]) {
  const admin = supabaseAdmin()
  const [
    { data: mappings, error: mErr },
    { data: overrides, error: oErr },
    { data: items, error: iErr },
    { data: productPrices, error: ppErr },
    { data: itemPrices, error: ipErr },
    { data: pillowProducts, error: pillowErr },
  ] =
    await Promise.all([
      admin
        .from('shopify_variant_mappings')
        .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,notes,updated_at')
        .order('kind', { ascending: true }),
      admin
        .from('shopify_variant_overrides')
        .select('shopify_variant_id,sku,price,compare_at_price,currency,updated_at'),
      admin.from('items').select('id,category,name,size,subtype').eq('is_active', true),
      admin.from('product_prices').select('key,msrp,currency'),
      admin.from('item_prices').select('item_id,msrp,currency'),
      admin.from('pillow_products').select('id,kind,size'),
    ])

  if (mErr) throw new Error(mErr.message)
  if (oErr) throw new Error(oErr.message)
  if (iErr) throw new Error(iErr.message)
  if (ppErr) throw new Error(ppErr.message)
  if (ipErr) throw new Error(ipErr.message)
  if (pillowErr) throw new Error(pillowErr.message)

  const itemById = new Map<number, { id: number; category: string; name: string; size: string | null; subtype: string | null }>()
  ;(items ?? []).forEach((it: { id: number; category: string; name: string; size: string | null; subtype: string | null }) => {
    itemById.set(Number(it.id), { ...it, id: Number(it.id) })
  })

  const overrideByVariantId = new Map<number, { sku: string | null; price: string | number | null; compare_at_price: string | number | null; currency: string | null }>()
  ;(overrides ?? []).forEach((o: { shopify_variant_id: number | string; sku: string | null; price: string | number | null; compare_at_price: string | number | null; currency: string | null }) => {
    overrideByVariantId.set(Number(o.shopify_variant_id), {
      sku: o.sku ?? null,
      price: o.price ?? null,
      compare_at_price: o.compare_at_price ?? null,
      currency: o.currency ?? null,
    })
  })

  const toMoneyString = (v: number | string | null | undefined): string | null => {
    if (v === null || v === undefined) return null
    const num = typeof v === 'number' ? v : Number.parseFloat(String(v))
    if (!Number.isFinite(num) || num < 0) return null
    return num.toFixed(2)
  }

  const detectPremiumVariantFromTitle = (title: string | null): 'linen' | 'fibrecool' => {
    const t = String(title || '').toLowerCase()
    if (t.includes('fibrecool')) return 'fibrecool'
    return 'linen'
  }

  const productPriceByKey = new Map<string, { key: string; msrp: number | string | null; currency: string | null }>()
  ;(productPrices ?? []).forEach((p: { key: string; msrp: number | string | null; currency: string | null }) => {
    productPriceByKey.set(String(p.key), p)
  })

  const itemMsrpByItemId = new Map<number, { item_id: number | string; msrp: number | string | null; currency: string | null }>()
  ;(itemPrices ?? []).forEach((r: { item_id: number | string; msrp: number | string | null; currency: string | null }) => {
    itemMsrpByItemId.set(Number(r.item_id), r)
  })

  const pillowProductIdByKindSize = new Map<string, number>()
  ;(pillowProducts ?? []).forEach((p: { id: number | string; kind: string | null; size: string }) => {
    const k = String(p.kind || 'basic')
    const size = String(p.size)
    if (!k || !size) return
    pillowProductIdByKindSize.set(`${k}:${size}`, Number(p.id))
  })

  const activeVariantIds = new Set<string>()
  const variantNameById = new Map<number, string>()
  const shopifyVariantTitleById = new Map<number, string>()
  for (const p of activeProducts) {
    const productTitle = String(p.title ?? '').trim()
    for (const v of p.variants ?? []) {
      const id = Number(v.id)
      activeVariantIds.add(String(id))
      const variantTitle = String(v.title ?? '').trim()
      shopifyVariantTitleById.set(id, variantTitle)
      const full = productTitle
        ? (variantTitle && variantTitle !== 'Default Title' ? `${productTitle} — ${variantTitle}` : productTitle)
        : (variantTitle || `Variant ${id}`)
      variantNameById.set(id, full)
    }
  }

  type Mapping = {
    shopify_variant_id: number | string
    kind: 'pillow' | 'bolster' | 'part'
    pillow_size: string | null
    pillow_kind: string | null
    bolster_variant: string | null
    item_id: number | string | null
    notes: string | null
    updated_at: string
  }

  const mappingByVariantId = new Map<number, Mapping>()
  ;(mappings ?? []).forEach((m: Mapping) => {
    const id = Number(m.shopify_variant_id)
    if (Number.isFinite(id) && id > 0) mappingByVariantId.set(id, m)
  })

  const computeMsrp = (variantId: number, m: Mapping | null): string | null => {
    if (!m) return null
    const itemId = m.item_id === null ? null : Number(m.item_id)
    if (m.kind === 'part' && itemId) {
      return toMoneyString(itemMsrpByItemId.get(itemId)?.msrp ?? null)
    }
    if (m.kind === 'bolster' && m.bolster_variant) {
      return toMoneyString(productPriceByKey.get(`product:bolster:${m.bolster_variant}`)?.msrp ?? null)
    }
    if (m.kind === 'pillow' && m.pillow_size) {
      const pk = (m.pillow_kind ?? 'basic') as 'basic' | 'premium'
      const pillowProductId = pillowProductIdByKindSize.get(`${pk}:${m.pillow_size}`) ?? null
      if (!pillowProductId) return null
      if (pk === 'premium') {
        const title = shopifyVariantTitleById.get(variantId) ?? null
        const premiumVariant = detectPremiumVariantFromTitle(title)
        const variantKey = `product:pillow:${pillowProductId}:${premiumVariant}`
        const baseKey = `product:pillow:${pillowProductId}`
        return toMoneyString(productPriceByKey.get(variantKey)?.msrp ?? productPriceByKey.get(baseKey)?.msrp ?? null)
      }
      return toMoneyString(productPriceByKey.get(`product:pillow:${pillowProductId}`)?.msrp ?? null)
    }
    return null
  }

  // If we can see active variants from Shopify, include "inactive" variants too
  // (mappings/overrides that no longer exist in Shopify's active products list).
  if (activeVariantIds.size) {
    const variantIdsToShow = new Set<number>()
    for (const rawId of Array.from(activeVariantIds)) {
      const n = Number(rawId)
      if (Number.isFinite(n) && n > 0) variantIdsToShow.add(n)
    }
    for (const id of mappingByVariantId.keys()) variantIdsToShow.add(id)
    for (const id of overrideByVariantId.keys()) variantIdsToShow.add(id)

    const rows = Array.from(variantIdsToShow)
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((variantId) => {
        const m = mappingByVariantId.get(variantId) ?? null
        const itemId = m?.item_id === null || m?.item_id === undefined ? null : Number(m.item_id)
        const shopifyStatus = activeVariantIds.has(String(variantId)) ? ('active' as const) : ('inactive' as const)
        const name =
          variantNameById.get(variantId) ?? (shopifyStatus === 'inactive' ? `Variant ${variantId}` : null)

        return {
          shopifyVariantId: variantId,
          shopifyVariantName: name,
          shopifyStatus,
          kind: m ? m.kind : ('unmapped' as const),
          pillowSize: m?.pillow_size ?? null,
          pillowKind: m?.pillow_kind ?? null,
          bolsterVariant: m?.bolster_variant ?? null,
          item: m?.kind === 'part' && itemId ? (itemById.get(itemId) ?? null) : null,
          notes: m?.notes ?? null,
          override: overrideByVariantId.get(variantId) ?? null,
          msrp: computeMsrp(variantId, m),
        }
      })
      .sort((a, b) => {
        const an = String(a.shopifyVariantName ?? '')
        const bn = String(b.shopifyVariantName ?? '')
        if (an && bn) return an.localeCompare(bn)
        if (an) return -1
        if (bn) return 1
        return Number(a.shopifyVariantId) - Number(b.shopifyVariantId)
      })

    return { ok: true, rows }
  }

  // Fallback (no Shopify active variants available): show mappings only.
  const rows = (mappings ?? [])
    .map((m: Mapping) => {
      const variantId = Number(m.shopify_variant_id)
      const itemId = m.item_id === null ? null : Number(m.item_id)
      return {
        shopifyVariantId: variantId,
        shopifyVariantName: variantNameById.get(variantId) ?? null,
        shopifyStatus: 'unknown' as const,
        kind: m.kind,
        pillowSize: m.pillow_size,
        pillowKind: m.pillow_kind,
        bolsterVariant: m.bolster_variant,
        item: itemId ? (itemById.get(itemId) ?? null) : null,
        notes: m.notes ?? null,
        override: overrideByVariantId.get(variantId) ?? null,
        msrp: computeMsrp(variantId, m),
      }
    })
    .filter((r) => Number.isFinite(Number(r.shopifyVariantId)) && Number(r.shopifyVariantId) > 0)

  return { ok: true, rows }
}

/**
 * Unmapped-variant list built from an already-fetched active-products payload.
 * Split out for the same reason as {@link buildShopifyAdminState}: it lets the
 * single Admin API fetch in {@link listShopifyRemoteProducts} serve both halves
 * of the panel instead of each action fetching the list for itself.
 */
async function buildShopifyUnmappedVariants(activeProducts: ShopifyActiveProduct[]) {
  const admin = supabaseAdmin()
  const { data: mappings, error: mErr } = await admin
    .from('shopify_variant_mappings')
    .select('shopify_variant_id')
  if (mErr) throw new Error(mErr.message)

  const mapped = new Set<string>((mappings ?? []).map((m: { shopify_variant_id: number | string }) => String(m.shopify_variant_id)))
  const variants: Array<{ id: number; label: string; sku: string | null }> = []

  for (const p of activeProducts) {
    const productTitle = String(p.title ?? '').trim()
    for (const v of p.variants ?? []) {
      const id = Number(v.id)
      if (!Number.isFinite(id) || id <= 0) continue
      if (mapped.has(String(id))) continue

      const variantTitle = String(v.title ?? '').trim()
      const full = productTitle
        ? (variantTitle && variantTitle !== 'Default Title' ? `${productTitle} — ${variantTitle}` : productTitle)
        : (variantTitle || `Variant ${id}`)

      variants.push({ id, label: full, sku: v.sku ?? null })
    }
  }

  variants.sort((a, b) => a.label.localeCompare(b.label))
  return { ok: true, variants }
}

/**
 * Database-only Shopify admin state. Deliberately does NOT call the Shopify
 * Admin API: that request dominated this action's latency and the panel's first
 * paint waited on it. Callers render this immediately, then upgrade to the full
 * view with {@link listShopifyRemoteProducts}.
 */
export async function listShopifyAdminState() {
  await assertAdmin('inventory')
  return buildShopifyAdminState([])
}

/**
 * The Shopify Admin API half of the panel: fetches the active products once and
 * uses that single payload to rebuild both the admin table and the unmapped
 * variant list. Its `rows` are what {@link listShopifyAdminState} used to
 * return, so the rendered result once this lands is identical to before.
 */
export async function listShopifyRemoteProducts() {
  await assertAdmin('shopify-link')
  // If env vars are missing in a local shell, fall back to the DB-only view.
  const activeProducts = (await shopifyListActiveProductsWithVariants({ limit: 250 }).catch(
    () => [],
  )) as ShopifyActiveProduct[]

  const [state, unmapped] = await Promise.all([
    buildShopifyAdminState(activeProducts),
    buildShopifyUnmappedVariants(activeProducts),
  ])

  return { ok: true as const, rows: state.rows, variants: unmapped.variants }
}

/**
 * Standalone unmapped-variant list, kept for callers that need only this half.
 */
export async function listShopifyUnmappedVariants() {
  await assertAdmin('shopify-link')
  const activeProducts = (await shopifyListActiveProductsWithVariants({ limit: 250 }).catch(
    () => [],
  )) as ShopifyActiveProduct[]
  return buildShopifyUnmappedVariants(activeProducts)
}

export async function upsertShopifyVariantOverride(input: z.infer<typeof UpsertShopifyOverrideSchema>) {
  await assertAnyAdmin(['inventory', 'shopify-link'])
  const parsed = UpsertShopifyOverrideSchema.parse(input)
  const admin = supabaseAdmin()

  const toMoney = (v: number | null | undefined) => {
    if (v === undefined) return undefined
    if (v === null) return null
    return v.toFixed(2)
  }

  const payload: Record<string, unknown> = {
    shopify_variant_id: parsed.shopifyVariantId,
  }
  if (parsed.sku !== undefined) payload.sku = parsed.sku
  if (parsed.price !== undefined) payload.price = toMoney(parsed.price)
  if (parsed.compareAtPrice !== undefined) payload.compare_at_price = toMoney(parsed.compareAtPrice)
  payload.currency = 'SGD'

  const { error } = await admin.from('shopify_variant_overrides').upsert(payload, { onConflict: 'shopify_variant_id' })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function deleteShopifyVariantOverride(shopifyVariantId: number) {
  await assertAnyAdmin(['inventory', 'shopify-link'])
  const id = ShopifyVariantIdSchema.parse(shopifyVariantId)
  const admin = supabaseAdmin()
  const { error } = await admin.from('shopify_variant_overrides').delete().eq('shopify_variant_id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function linkPartToShopifyVariant(input: z.infer<typeof LinkPartMappingSchema>) {
  await assertAnyAdmin(['inventory', 'shopify-link'])
  const parsed = LinkPartMappingSchema.parse(input)
  const admin = supabaseAdmin()

  // Alteration-derived items are internal-only; they should inherit Shopify behavior from their base item.
  const { data: item, error: itemErr } = await admin
    .from('items')
    .select('id,category,alteration_of_item_id')
    .eq('id', parsed.itemId)
    .eq('is_active', true)
    .maybeSingle()
  if (itemErr) throw new Error(itemErr.message)
  if (!item) throw new Error('Item not found or inactive')
  if (item.category === 'filling' && item.alteration_of_item_id) {
    throw new Error('Altered filling items should not be linked to Shopify (they use the base variant mapping).')
  }

  const payload = {
    shopify_variant_id: parsed.shopifyVariantId,
    kind: 'part' as const,
    pillow_size: null,
    pillow_kind: null,
    bolster_variant: null,
    item_id: parsed.itemId,
    default_template_id: null,
  }
  const { error } = await admin.from('shopify_variant_mappings').upsert(payload, { onConflict: 'shopify_variant_id' })
  if (error) throw new Error(error.message)
  scheduleMirrorReResolve([parsed.shopifyVariantId])
  return { ok: true }
}

export async function linkPillowToShopifyVariant(input: z.infer<typeof LinkPillowMappingSchema>) {
  await assertAdmin('shopify-link')
  const parsed = LinkPillowMappingSchema.parse(input)
  const admin = supabaseAdmin()
  const payload = {
    shopify_variant_id: parsed.shopifyVariantId,
    kind: 'pillow' as const,
    pillow_size: parsed.pillowSize,
    pillow_kind: parsed.pillowKind,
    bolster_variant: null,
    item_id: null,
    default_template_id: parsed.templateId ?? null,
  }
  const { error } = await admin.from('shopify_variant_mappings').upsert(payload, { onConflict: 'shopify_variant_id' })
  if (error) throw new Error(error.message)
  scheduleMirrorReResolve([parsed.shopifyVariantId])
  return { ok: true }
}

export async function linkBolsterToShopifyVariant(input: z.infer<typeof LinkBolsterMappingSchema>) {
  await assertAdmin('shopify-link')
  const parsed = LinkBolsterMappingSchema.parse(input)
  const admin = supabaseAdmin()
  const payload = {
    shopify_variant_id: parsed.shopifyVariantId,
    kind: 'bolster' as const,
    pillow_size: null,
    pillow_kind: null,
    bolster_variant: parsed.bolsterVariant,
    item_id: null,
    default_template_id: parsed.templateId ?? null,
  }
  const { error } = await admin.from('shopify_variant_mappings').upsert(payload, { onConflict: 'shopify_variant_id' })
  if (error) throw new Error(error.message)
  scheduleMirrorReResolve([parsed.shopifyVariantId])
  return { ok: true }
}

export async function deleteShopifyMapping(shopifyVariantId: number) {
  await assertAnyAdmin(['inventory', 'shopify-link'])
  const id = ShopifyVariantIdSchema.parse(shopifyVariantId)
  const admin = supabaseAdmin()
  const { error } = await admin.from('shopify_variant_mappings').delete().eq('shopify_variant_id', id)
  if (error) throw new Error(error.message)
  scheduleMirrorReResolve([id])
  return { ok: true }
}
