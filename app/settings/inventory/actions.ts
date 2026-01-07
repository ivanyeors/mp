"use server";

import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'
import { syncShopifyPricingFromSupabase } from '@/lib/shopify/pricing'
import { shopifyListActiveProductsWithVariants } from '@/lib/shopify/products'

const SellPillowSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() })
const ItemQtySchema = z.object({ itemId: z.number().int().positive(), quantity: z.number().int().positive() })
const DeleteItemSchema = z.object({ itemId: z.number().int().positive() })
const RenameItemSchema = z.object({
  itemId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Name is required').max(120),
})
const SellBolsterSchema = z.object({
  quantity: z.number().int().positive(),
  variant: z.enum(['short','medium','long']).default('medium'),
  components: z.object({
    caseQty: z.number().int().positive().default(1),
    protectorQty: z.number().int().positive().default(1),
    fillingQty: z.number().int().positive().default(1),
  }).optional(),
})

const SellFromTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})

const CommitShopifySalesSchema = z.object({
  commits: z.array(z.object({
    queueId: z.number().int().positive(),
    templateId: z.number().int().positive().nullable(),
  })).min(1),
})

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

export async function sellPillow(input: z.infer<typeof SellPillowSchema>) {
  const parsed = SellPillowSchema.parse(input)
  const admin = supabaseAdmin()

  const { data: lines, error: blErr } = await admin
    .from('bom_lines')
    .select('item_id,quantity')
    .eq('product_id', parsed.productId)
  if (blErr) throw new Error(blErr.message)

  if (!lines?.length) throw new Error('No BOM configured for product')

  const txns = lines.map(l => ({ item_id: l.item_id, quantity_signed: -1 * Number(l.quantity) * parsed.quantity, reason: 'sale' as const }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function sellPart(input: z.infer<typeof ItemQtySchema>) {
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const { error } = await admin.from('inventory_transactions').insert({ item_id: parsed.itemId, quantity_signed: -parsed.quantity, reason: 'sale' })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function receiveStock(input: z.infer<typeof ItemQtySchema>) {
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const { error } = await admin.from('inventory_transactions').insert({ item_id: parsed.itemId, quantity_signed: parsed.quantity, reason: 'receive' })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function setThreshold(itemId: number, minLevel: number) {
  const admin = supabaseAdmin()
  const { error } = await admin.from('item_thresholds').upsert({ item_id: itemId, min_level: minLevel })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function sellBolster(input: z.infer<typeof SellBolsterSchema>) {
  const parsed = SellBolsterSchema.parse(input)
  const admin = supabaseAdmin()

  // Read bolster configuration from DB; fallback to defaults if none
  const { data: lines, error: blErr } = await admin
    .from('bolster_bom_lines')
    .select('item_id,quantity')
    .eq('variant', parsed.variant)
  if (blErr) throw new Error(blErr.message)

  let effectiveLines = (lines ?? []).map(l => ({ item_id: l.item_id, quantity: Number(l.quantity) }))

  if (!effectiveLines.length) {
    // Fallback to legacy implicit mapping if DB not configured yet
    type IdRow = { id: number }
    const { data: caseItem } = await admin.from('items').select('id').eq('category', 'bolster_case').eq('size', 'BOLSTER').limit(1).maybeSingle()
    const { data: protectorItem } = await admin.from('items').select('id').eq('category', 'bolster_protector').eq('size', 'BOLSTER').limit(1).maybeSingle()
    const { data: fillingItem } = await admin.from('items').select('id').eq('category', 'filling').eq('subtype', '6D (L)').limit(1).maybeSingle()
    const prelim = [caseItem, protectorItem, fillingItem].filter((r): r is IdRow => !!r)
    effectiveLines = prelim.map((r) => ({ item_id: r.id, quantity: 1 }))
  }

  const txns = effectiveLines.map(l => ({ item_id: l.item_id, quantity_signed: -1 * parsed.quantity * Number(l.quantity), reason: 'sale' as const }))

  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function sellFromTemplate(input: z.infer<typeof SellFromTemplateSchema>) {
  const parsed = SellFromTemplateSchema.parse(input)
  const admin = supabaseAdmin()

  const { data: template, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name')
    .eq('id', parsed.templateId)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!template) throw new Error('Template not found')

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', parsed.templateId)
  if (lErr) throw new Error(lErr.message)
  if (!lines?.length) throw new Error('Template has no lines')

  const txns = lines.map((l) => ({
    item_id: Number(l.item_id),
    quantity_signed: -1 * Number(l.quantity) * parsed.quantity,
    reason: 'sale' as const,
    metadata: { template_id: parsed.templateId, template_kind: template.kind, template_key: template.key, template_name: template.name },
  }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function listShopifySalesQueue() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('shopify_sales_queue')
    .select('id,shopify_order_id,shopify_line_item_id,shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,quantity,variant_title,sku,created_at,status,chosen_template_id')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { ok: true, rows: data ?? [] }
}

export async function listShopifySalesQueueArchived() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('shopify_sales_queue')
    .select('id,shopify_order_id,shopify_line_item_id,shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,quantity,variant_title,sku,created_at,status,chosen_template_id')
    .eq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { ok: true, rows: data ?? [] }
}

export async function archiveShopifySaleQueueRow(queueId: number) {
  const admin = supabaseAdmin()
  const { error } = await admin
    .from('shopify_sales_queue')
    .update({ status: 'archived' })
    .eq('id', queueId)
    .neq('status', 'committed')
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function listTemplates(kind: 'pillow' | 'bolster', key: string, pillowKind?: 'basic' | 'premium', pillowVariant?: 'linen' | 'fibrecool') {
  const admin = supabaseAdmin()
  const effectivePillowKind = kind === 'pillow' ? (pillowKind ?? 'basic') : null
  const effectivePillowVariant = kind === 'pillow' && effectivePillowKind === 'premium' ? (pillowVariant ?? null) : null

  let q = admin
    .from('bom_templates')
    .select('id,name,kind,key,pillow_kind')
    .eq('kind', kind)
    .eq('key', key)
    .order('updated_at', { ascending: false })

  if (kind === 'pillow') {
    q = q.eq('pillow_kind', effectivePillowKind)
    if (effectivePillowKind === 'premium' && effectivePillowVariant) {
      q = q.eq('pillow_variant', effectivePillowVariant)
    }
  }
  else q = q.is('pillow_kind', null)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { ok: true, templates: data ?? [] }
}

export async function commitShopifySales(input: z.infer<typeof CommitShopifySalesSchema>) {
  const parsed = CommitShopifySalesSchema.parse(input)
  const admin = supabaseAdmin()

  // Load queue rows
  const ids = parsed.commits.map(c => c.queueId)
  const { data: rows, error: qErr } = await admin
    .from('shopify_sales_queue')
    .select('id,kind,pillow_size,bolster_variant,item_id,quantity,status')
    .in('id', ids)
  if (qErr) throw new Error(qErr.message)

  type QueueRow = {
    id: number
    kind: 'pillow' | 'bolster' | 'part'
    pillow_size: string | null
    bolster_variant: string | null
    item_id: number | null
    quantity: number | string
    status: 'pending' | 'committed' | 'cancelled' | string
  }
  const byId = new Map<number, QueueRow>(((rows ?? []) as QueueRow[]).map(r => [Number(r.id), r]))

  // Commit each line (template required for pillow/bolster)
  for (const c of parsed.commits) {
    const row = byId.get(c.queueId)
    if (!row) throw new Error(`Queue row not found: ${c.queueId}`)
    if (row.status !== 'pending') continue

    if (row.kind === 'part') {
      if (!row.item_id) throw new Error(`Missing item_id for part row ${c.queueId}`)
      await sellPart({ itemId: Number(row.item_id), quantity: Number(row.quantity) })
    } else {
      if (!c.templateId) throw new Error(`Template is required for ${row.kind} row ${c.queueId}`)
      await sellFromTemplate({ templateId: c.templateId, quantity: Number(row.quantity) })
    }

    const { error: upErr } = await admin
      .from('shopify_sales_queue')
      .update({ status: 'committed', chosen_template_id: c.templateId, committed_at: new Date().toISOString() })
      .eq('id', c.queueId)
      .eq('status', 'pending')
    if (upErr) throw new Error(upErr.message)
  }

  // After committing, sync Shopify inventory to reflect new balances/buildable.
  try {
    await syncShopifyInventoryFromBuildable()
  } catch {
    // non-fatal; user can run manual sync
  }

  return { ok: true }
}

export async function deleteInventoryItem(input: z.infer<typeof DeleteItemSchema>) {
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

export async function addInventoryItem(input: z.infer<typeof AddItemSchema>) {
  const parsed = AddItemSchema.parse(input)
  const admin = supabaseAdmin()

  const rawSize = parsed.size?.trim()
  const normalizedSize =
    rawSize && rawSize !== '-'
      ? (
        ['cover', 'pillow_case', 'pillow_protector', 'bolster_case', 'bolster_protector'].includes(parsed.category)
          ? rawSize.toUpperCase()
          : rawSize
      )
      : null
  const normalizedSubtype = parsed.subtype?.trim() ? parsed.subtype.trim() : null
  const normalizedName = parsed.name

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
      is_active: true,
    })
    .select('id,category,name,size,subtype')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
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
    const { error: stockErr } = await admin.from('inventory_transactions').insert({
      item_id: item.id,
      quantity_signed: parsed.initialStock,
      reason: 'receive',
    })
    if (stockErr) throw new Error(stockErr.message)
  }

  return { ok: true, item }
}

export async function fullShopifySync() {
  const [inventory, prices] = await Promise.all([
    syncShopifyInventoryFromBuildable(),
    syncShopifyPricingFromSupabase(),
  ])
  return { ok: true, inventory, prices }
}

export async function syncShopifyPricesOnly() {
  const prices = await syncShopifyPricingFromSupabase()
  return { ok: true, prices }
}

export async function listShopifyAdminState() {
  const admin = supabaseAdmin()
  const [
    { data: mappings, error: mErr },
    { data: overrides, error: oErr },
    { data: items, error: iErr },
    { data: productPrices, error: ppErr },
    { data: itemPrices, error: ipErr },
    { data: pillowProducts, error: pillowErr },
    activeProducts,
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
      // Used to filter to "active SKUs only" in UI.
      // If env vars are missing in a local shell, we fall back to showing all mappings.
      shopifyListActiveProductsWithVariants({ limit: 250 }).catch(() => []),
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
  for (const p of (activeProducts ?? []) as Array<{ title?: string; variants?: Array<{ id: number; title?: string }> }>) {
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

  const rows = (mappings ?? [])
    .map((m: {
    shopify_variant_id: number | string
    kind: 'pillow' | 'bolster' | 'part'
    pillow_size: string | null
    pillow_kind: string | null
    bolster_variant: string | null
    item_id: number | string | null
    notes: string | null
    updated_at: string
  }) => {
    const variantId = Number(m.shopify_variant_id)
    const itemId = m.item_id === null ? null : Number(m.item_id)

    // Compute MSRP (Price) from Costings as source of truth.
    let msrp: string | null = null
    if (m.kind === 'part' && itemId) {
      msrp = toMoneyString(itemMsrpByItemId.get(itemId)?.msrp ?? null)
    } else if (m.kind === 'bolster' && m.bolster_variant) {
      msrp = toMoneyString(productPriceByKey.get(`product:bolster:${m.bolster_variant}`)?.msrp ?? null)
    } else if (m.kind === 'pillow' && m.pillow_size) {
      const pk = (m.pillow_kind ?? 'basic') as 'basic' | 'premium'
      const pillowProductId = pillowProductIdByKindSize.get(`${pk}:${m.pillow_size}`) ?? null
      if (pillowProductId) {
        if (pk === 'premium') {
          const title = shopifyVariantTitleById.get(variantId) ?? null
          const premiumVariant = detectPremiumVariantFromTitle(title)
          msrp = toMoneyString(productPriceByKey.get(`product:pillow:${pillowProductId}:${premiumVariant}`)?.msrp ?? null)
        } else {
          msrp = toMoneyString(productPriceByKey.get(`product:pillow:${pillowProductId}`)?.msrp ?? null)
        }
      }
    }

    return {
      shopifyVariantId: variantId,
      shopifyVariantName: variantNameById.get(variantId) ?? null,
      isActiveInShopify: activeVariantIds.size ? activeVariantIds.has(String(variantId)) : true,
      kind: m.kind,
      pillowSize: m.pillow_size,
      pillowKind: m.pillow_kind,
      bolsterVariant: m.bolster_variant,
      item: itemId ? (itemById.get(itemId) ?? null) : null,
      notes: m.notes ?? null,
      override: overrideByVariantId.get(variantId) ?? null,
      msrp,
    }
  })
    // Default behavior: active variants only (user asked for this).
    .filter((r: { isActiveInShopify: boolean }) => r.isActiveInShopify)

  return { ok: true, rows }
}

export async function listShopifyUnmappedVariants() {
  const admin = supabaseAdmin()
  const [{ data: mappings, error: mErr }, activeProducts] = await Promise.all([
    admin.from('shopify_variant_mappings').select('shopify_variant_id'),
    // If env vars are missing, gracefully return an empty list (can't discover Shopify variants).
    shopifyListActiveProductsWithVariants({ limit: 250 }).catch(() => []),
  ])
  if (mErr) throw new Error(mErr.message)

  const mapped = new Set<string>((mappings ?? []).map((m: { shopify_variant_id: number | string }) => String(m.shopify_variant_id)))
  const variants: Array<{ id: number; label: string; sku: string | null }> = []

  for (const p of (activeProducts ?? []) as Array<{ title?: string; variants?: Array<{ id: number; title?: string; sku?: string | null }> }>) {
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

export async function upsertShopifyVariantOverride(input: z.infer<typeof UpsertShopifyOverrideSchema>) {
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
  const id = ShopifyVariantIdSchema.parse(shopifyVariantId)
  const admin = supabaseAdmin()
  const { error } = await admin.from('shopify_variant_overrides').delete().eq('shopify_variant_id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function linkPartToShopifyVariant(input: z.infer<typeof LinkPartMappingSchema>) {
  const parsed = LinkPartMappingSchema.parse(input)
  const admin = supabaseAdmin()
  const payload = {
    shopify_variant_id: parsed.shopifyVariantId,
    kind: 'part' as const,
    pillow_size: null,
    pillow_kind: null,
    bolster_variant: null,
    item_id: parsed.itemId,
  }
  const { error } = await admin.from('shopify_variant_mappings').upsert(payload, { onConflict: 'shopify_variant_id' })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function deleteShopifyMapping(shopifyVariantId: number) {
  const id = ShopifyVariantIdSchema.parse(shopifyVariantId)
  const admin = supabaseAdmin()
  const { error } = await admin.from('shopify_variant_mappings').delete().eq('shopify_variant_id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}
