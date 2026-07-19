"use server";

import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/auth/admin'
import { syncShopifyInventoryFromBuildable, syncShopifyInventoryForDepletedItems } from '@/lib/shopify/sync'
import { syncShopifyPricingFromSupabase } from '@/lib/shopify/pricing'
import { shopifyListActiveProductsWithVariants } from '@/lib/shopify/products'
import { shopifyListPaidOrders } from '@/lib/shopify/orders'
import { resolveShopifyQueueLineItemId } from '@/lib/shopify/queue-line-item-id'
import { aggregateSignedQuantities, combineTemplateSaleLines } from '@/lib/inventory/template-sale-lines'
import { reResolveShopifyLineCosts } from '@/lib/shopify/order-mirror-ingest'

function scheduleMirrorReResolve(variantIds: number[]) {
  after(() => {
    void reResolveShopifyLineCosts({ variantIds }).catch((err) => {
      console.error('[shopify-mirror] re-resolve failed', err)
    })
  })
}

const SellPillowSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() })
const ItemQtySchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})
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
  fillingTemplateId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})

const ReplaceLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive(),
})

const CommitShopifySalesSchema = z.object({
  commits: z.array(z.object({
    queueId: z.number().int().positive(),
    templateId: z.number().int().positive().nullable(),
    replaceLines: z.array(ReplaceLineSchema).optional(),
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

async function resolveEffectiveStockItemIds(admin: ReturnType<typeof supabaseAdmin>, itemIds: number[]) {
  const unique = Array.from(new Set(itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
  const out = new Map<number, number>()
  if (!unique.length) return out

  const { data, error } = await admin
    .from('items')
    .select('id,category,alteration_of_item_id')
    .in('id', unique)
  if (error) throw new Error(error.message)

  ;(data ?? []).forEach((r: { id: number | string; category: string | null; alteration_of_item_id?: number | string | null }) => {
    const id = Number(r.id)
    if (!Number.isFinite(id) || id <= 0) return
    const cat = String(r.category ?? '').trim().toLowerCase()
    const baseRaw = r.alteration_of_item_id === null || r.alteration_of_item_id === undefined ? null : Number(r.alteration_of_item_id)
    if (cat === 'filling' && baseRaw && Number.isFinite(baseRaw) && baseRaw > 0) out.set(id, baseRaw)
    else out.set(id, id)
  })

  // Defensive default: identity mapping.
  unique.forEach((id) => {
    if (!out.has(id)) out.set(id, id)
  })
  return out
}

type ShopifyCommitMeta = {
  shopify_queue_id: number
  shopify_order_id?: number
  shopify_line_item_id?: number | null
}

function shopifyCommitMetadata(meta: ShopifyCommitMeta): Record<string, string> {
  const out: Record<string, string> = { shopify_queue_id: String(meta.shopify_queue_id) }
  if (meta.shopify_order_id != null) out.shopify_order_id = String(meta.shopify_order_id)
  if (meta.shopify_line_item_id != null) out.shopify_line_item_id = String(meta.shopify_line_item_id)
  return out
}

async function hasShopifyQueueInventoryDeduction(admin: ReturnType<typeof supabaseAdmin>, queueId: number) {
  const { count, error } = await admin
    .from('inventory_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>shopify_queue_id', String(queueId))
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function sellPartForShopifyCommit(
  admin: ReturnType<typeof supabaseAdmin>,
  input: { itemId: number; quantity: number } & ShopifyCommitMeta,
) {
  if (await hasShopifyQueueInventoryDeduction(admin, input.shopify_queue_id)) return { skipped: true as const }

  const effectiveById = await resolveEffectiveStockItemIds(admin, [input.itemId])
  const effectiveId = effectiveById.get(input.itemId) ?? input.itemId
  const { error } = await admin.from('inventory_transactions').insert({
    item_id: effectiveId,
    quantity_signed: -input.quantity,
    reason: 'sale',
    metadata: shopifyCommitMetadata(input),
  })
  if (error) throw new Error(error.message)
  return { skipped: false as const }
}

async function sellFromTemplateForShopifyCommit(
  admin: ReturnType<typeof supabaseAdmin>,
  input: { templateId: number; quantity: number } & ShopifyCommitMeta,
) {
  if (await hasShopifyQueueInventoryDeduction(admin, input.shopify_queue_id)) return { skipped: true as const }

  const { data: template, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name')
    .eq('id', input.templateId)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!template) throw new Error('Template not found')

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', input.templateId)
  if (lErr) throw new Error(lErr.message)
  if (!lines?.length) throw new Error('Template has no lines')

  const ids = lines.map((l: { item_id: number | string }) => Number(l.item_id)).filter((id) => Number.isFinite(id) && id > 0)
  const effectiveById = await resolveEffectiveStockItemIds(admin, ids)
  const aggregated = aggregateSignedQuantities(
    lines.map((l: { item_id: number | string; quantity: number | string }) => {
      const originalId = Number(l.item_id)
      const effectiveId = effectiveById.get(originalId) ?? originalId
      return { item_id: effectiveId, quantity_signed: -1 * Number(l.quantity) * input.quantity }
    }),
  )
  const txns = aggregated.map((t) => ({
    ...t,
    reason: 'sale' as const,
    metadata: {
      ...shopifyCommitMetadata(input),
      template_id: input.templateId,
      template_kind: template.kind,
      template_key: template.key,
      template_name: template.name,
    },
  }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { skipped: false as const }
}

async function sellFromReplaceLinesForShopifyCommit(
  admin: ReturnType<typeof supabaseAdmin>,
  input: { lines: Array<{ item_id: number; quantity: number }>; quantity: number } & ShopifyCommitMeta,
) {
  if (await hasShopifyQueueInventoryDeduction(admin, input.shopify_queue_id)) return { skipped: true as const }
  if (!input.lines.length) throw new Error('Replace lines required')

  const ids = input.lines.map((l) => Number(l.item_id)).filter((id) => Number.isFinite(id) && id > 0)
  const effectiveById = await resolveEffectiveStockItemIds(admin, ids)
  const aggregated = aggregateSignedQuantities(
    input.lines.map((l) => {
      const originalId = Number(l.item_id)
      const effectiveId = effectiveById.get(originalId) ?? originalId
      return { item_id: effectiveId, quantity_signed: -1 * Number(l.quantity) * input.quantity }
    }),
  )
  const txns = aggregated.map((t) => ({
    ...t,
    reason: 'sale' as const,
    metadata: {
      ...shopifyCommitMetadata(input),
      replace: 'true',
      replace_lines: JSON.stringify(input.lines),
    },
  }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { skipped: false as const }
}

export async function sellPillow(input: z.infer<typeof SellPillowSchema>) {
  const parsed = SellPillowSchema.parse(input)
  const admin = supabaseAdmin()

  const { data: lines, error: blErr } = await admin
    .from('bom_lines')
    .select('item_id,quantity')
    .eq('product_id', parsed.productId)
  if (blErr) throw new Error(blErr.message)

  if (!lines?.length) throw new Error('No BOM configured for product')

  const ids = lines.map((l: { item_id: number | string }) => Number(l.item_id)).filter((id) => Number.isFinite(id) && id > 0)
  const effectiveById = await resolveEffectiveStockItemIds(admin, ids)
  const aggregated = aggregateSignedQuantities(
    lines.map((l: { item_id: number | string; quantity: number | string }) => {
      const originalId = Number(l.item_id)
      const effectiveId = effectiveById.get(originalId) ?? originalId
      return { item_id: effectiveId, quantity_signed: -1 * Number(l.quantity) * parsed.quantity }
    }),
  )
  const txns = aggregated.map((t) => ({ ...t, reason: 'sale' as const }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function sellPart(input: z.infer<typeof ItemQtySchema>) {
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const effectiveById = await resolveEffectiveStockItemIds(admin, [parsed.itemId])
  const effectiveId = effectiveById.get(parsed.itemId) ?? parsed.itemId
  const { error } = await admin.from('inventory_transactions').insert({
    item_id: effectiveId,
    quantity_signed: -parsed.quantity,
    reason: 'sale',
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function receiveStock(input: z.infer<typeof ItemQtySchema>) {
  const parsed = ItemQtySchema.parse(input)
  const admin = supabaseAdmin()
  const effectiveById = await resolveEffectiveStockItemIds(admin, [parsed.itemId])
  const effectiveId = effectiveById.get(parsed.itemId) ?? parsed.itemId

  const { error } = await admin.from('inventory_transactions').insert({
    item_id: effectiveId,
    quantity_signed: parsed.quantity,
    reason: 'receive',
  })
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

  const ids = effectiveLines.map((l) => Number(l.item_id)).filter((id) => Number.isFinite(id) && id > 0)
  const effectiveById = await resolveEffectiveStockItemIds(admin, ids)
  const aggregated = aggregateSignedQuantities(
    effectiveLines.map((l) => {
      const originalId = Number(l.item_id)
      const effectiveId = effectiveById.get(originalId) ?? originalId
      return { item_id: effectiveId, quantity_signed: -1 * parsed.quantity * Number(l.quantity) }
    }),
  )
  const txns = aggregated.map((t) => ({ ...t, reason: 'sale' as const }))

  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function sellFromTemplate(input: z.infer<typeof SellFromTemplateSchema>) {
  const parsed = SellFromTemplateSchema.parse(input)
  const admin = supabaseAdmin()

  const { data: template, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,role')
    .eq('id', parsed.templateId)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!template) throw new Error('Template not found')
  if (template.role !== 'warehouse') throw new Error('Template must be a warehouse template')

  const { data: fillingTemplate, error: fErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,role')
    .eq('id', parsed.fillingTemplateId)
    .maybeSingle()
  if (fErr) throw new Error(fErr.message)
  if (!fillingTemplate) throw new Error('Filling template not found')
  if (fillingTemplate.role !== 'filling') throw new Error('Filling template must have role=filling')
  if (fillingTemplate.kind !== template.kind || fillingTemplate.key !== template.key) {
    throw new Error('Filling template does not match product size/length')
  }

  const [{ data: warehouseLines, error: wErr }, { data: fillingLines, error: lErr }] = await Promise.all([
    admin.from('bom_template_lines').select('item_id,quantity').eq('template_id', parsed.templateId),
    admin.from('bom_template_lines').select('item_id,quantity').eq('template_id', parsed.fillingTemplateId),
  ])
  if (wErr) throw new Error(wErr.message)
  if (lErr) throw new Error(lErr.message)
  if (!warehouseLines?.length) throw new Error('Warehouse template has no lines')
  if (!fillingLines?.length) throw new Error('Filling template has no lines')

  const combined = combineTemplateSaleLines(
    warehouseLines.map((l: { item_id: number | string; quantity: number | string }) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
    })),
    fillingLines.map((l: { item_id: number | string; quantity: number | string }) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
    })),
    parsed.quantity,
  )

  const ids = combined.map((l) => l.item_id).filter((id) => Number.isFinite(id) && id > 0)
  const effectiveById = await resolveEffectiveStockItemIds(admin, ids)
  const aggregated = aggregateSignedQuantities(
    combined.map((l) => ({
      item_id: effectiveById.get(l.item_id) ?? l.item_id,
      quantity_signed: l.quantity_signed,
    })),
  )
  const txns = aggregated.map((t) => ({
    ...t,
    reason: 'sale' as const,
    metadata: {
      template_id: parsed.templateId,
      template_kind: template.kind,
      template_key: template.key,
      template_name: template.name,
      filling_template_id: parsed.fillingTemplateId,
      filling_template_name: fillingTemplate.name,
    },
  }))
  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}

export async function listShopifySalesQueue() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('shopify_sales_queue')
    .select('id,shopify_order_id,shopify_order_name,shopify_order_created_at,shopify_line_item_id,shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,quantity,variant_title,sku,created_at,status,chosen_template_id,fulfillment_status,metadata')
    .eq('status', 'pending')
    .order('shopify_order_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { ok: true, rows: data ?? [] }
}

export async function listShopifySalesQueueArchived() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('shopify_sales_queue')
    .select('id,shopify_order_id,shopify_order_name,shopify_order_created_at,shopify_line_item_id,shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,quantity,variant_title,sku,created_at,status,chosen_template_id,fulfillment_status,metadata')
    .eq('status', 'archived')
    .order('shopify_order_created_at', { ascending: false, nullsFirst: false })
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
    .eq('status', 'pending')
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function refreshShopifySalesQueueFromShopify(input?: {
  // Prefer explicit from/to (ISO strings). daysBack is kept for backward compatibility.
  from?: string
  to?: string
  daysBack?: number
  limit?: number
}) {
  const admin = supabaseAdmin()

  const limit = Math.max(1, Math.min(250, Math.floor(input?.limit ?? 250)))
  const createdAtMin =
    input?.from?.trim()
      ? input.from.trim()
      : new Date(Date.now() - Math.max(1, Math.min(60, Math.floor(input?.daysBack ?? 30))) * 24 * 60 * 60 * 1000).toISOString()
  const createdAtMax = input?.to?.trim() ? input.to.trim() : undefined

  const orders = await shopifyListPaidOrders({ limit, createdAtMin, createdAtMax })
  const orderMetaById = new Map<
    number,
    { fulfillment_status: string | null; name: string | null; created_at: string | null }
  >()
  orders.forEach((o) => {
    orderMetaById.set(Number(o.id), {
      fulfillment_status: o.fulfillment_status ?? null,
      name: o.name ?? null,
      created_at: o.created_at ?? null,
    })
  })

  const lineItems = orders.flatMap((o) =>
    (o.line_items ?? []).map((li, lineIndex) => ({
      order_id: o.id,
      line_item_id: resolveShopifyQueueLineItemId(o.id, lineIndex, li.id),
      variant_id: li.variant_id,
      sku: li.sku ?? null,
      title: li.title ?? null,
      quantity: Math.max(0, Math.floor(Number(li.quantity ?? 0))),
    })),
  )

  const variantIds = Array.from(
    new Set(lineItems.map((li) => li.variant_id).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))),
  )

  const { data: templateRows, error: templateErr } = await admin.from('bom_templates').select('id')
  if (templateErr) throw new Error(templateErr.message)
  const validTemplateIds = new Set(
    (templateRows ?? []).map((row: { id: number | string }) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0),
  )

  type MappingRow = {
    shopify_variant_id: number
    kind: 'pillow' | 'bolster' | 'part'
    pillow_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | null
    pillow_kind: 'basic' | 'premium' | null
    bolster_variant: 'short' | 'medium' | 'long' | null
    item_id: number | null
    default_template_id?: number | null
  }

  const mappingByVariantId = new Map<number, MappingRow>()
  if (variantIds.length) {
    const { data: mappings, error: mErr } = await admin
      .from('shopify_variant_mappings')
      .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,default_template_id')
      .in('shopify_variant_id', variantIds)
    if (mErr) throw new Error(mErr.message)
    ;(mappings ?? []).forEach((m: MappingRow) => mappingByVariantId.set(Number(m.shopify_variant_id), m))
  }

  let mapped = 0
  let unmapped = 0
  const queueRows = []
  for (const li of lineItems) {
    if (!li.quantity) continue
    if (!li.variant_id) {
      unmapped += 1
      continue
    }
    const mapping = mappingByVariantId.get(li.variant_id)
    if (!mapping) {
      unmapped += 1
      continue
    }
    mapped += 1
    const orderMeta = orderMetaById.get(Number(li.order_id)) ?? {
      fulfillment_status: null,
      name: null,
      created_at: null,
    }
    const defaultTemplateId =
      mapping.default_template_id != null && validTemplateIds.has(Number(mapping.default_template_id))
        ? Number(mapping.default_template_id)
        : null
    queueRows.push({
      shopify_order_id: li.order_id,
      shopify_order_name: orderMeta.name,
      shopify_order_created_at: orderMeta.created_at,
      shopify_line_item_id: li.line_item_id,
      shopify_variant_id: Number(mapping.shopify_variant_id),
      kind: mapping.kind,
      pillow_size: mapping.kind === 'pillow' ? mapping.pillow_size : null,
      pillow_kind: mapping.kind === 'pillow' ? (mapping.pillow_kind ?? 'basic') : null,
      bolster_variant: mapping.kind === 'bolster' ? mapping.bolster_variant : null,
      item_id: mapping.kind === 'part' ? mapping.item_id : null,
      quantity: li.quantity,
      product_title: null,
      variant_title: li.title,
      sku: li.sku,
      chosen_template_id:
        mapping.kind === 'pillow' || mapping.kind === 'bolster' ? defaultTemplateId : null,
      fulfillment_status: orderMeta.fulfillment_status,
      metadata: { source: 'manual_refresh', created_at_min: createdAtMin, created_at_max: createdAtMax ?? null },
    })
  }

  if (queueRows.length) {
    const { error: qErr } = await admin.from('shopify_sales_queue').upsert(queueRows, {
      onConflict: 'shopify_order_id,shopify_line_item_id,shopify_variant_id,kind',
    })
    if (qErr) throw new Error(qErr.message)
  }

  return { ok: true, scanned_orders: orders.length, scanned_lines: lineItems.length, mapped, unmapped, enqueued: queueRows.length }
}

export async function listTemplates(kind: 'pillow' | 'bolster', key: string, pillowKind?: 'basic' | 'premium', pillowVariant?: 'linen' | 'fibrecool') {
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
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('bom_templates')
    .select('id,name,kind,key')
    .eq('kind', kind)
    .eq('key', key)
    .eq('role', 'filling')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
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
    .select('id,kind,pillow_size,pillow_kind,bolster_variant,item_id,quantity,status,shopify_variant_id,shopify_order_id,shopify_line_item_id')
    .in('id', ids)
  if (qErr) throw new Error(qErr.message)

  type QueueRow = {
    id: number
    kind: 'pillow' | 'bolster' | 'part'
    pillow_size: string | null
    pillow_kind: string | null
    bolster_variant: string | null
    item_id: number | null
    quantity: number | string
    status: 'pending' | 'committed' | 'cancelled' | string
    shopify_variant_id: number | string | null
    shopify_order_id: number | string
    shopify_line_item_id: number | string | null
  }
  const byId = new Map<number, QueueRow>(((rows ?? []) as QueueRow[]).map(r => [Number(r.id), r]))

  // Guard: ensure part + replace item_ids still exist + are active.
  const itemIdsToValidate = Array.from(
    new Set([
      ...Array.from(byId.values())
        .filter((r) => r.kind === 'part' && r.status === 'pending' && r.item_id)
        .map((r) => Number(r.item_id)),
      ...parsed.commits.flatMap((c) => (c.replaceLines ?? []).map((l) => l.item_id)),
    ]),
  )
  if (itemIdsToValidate.length) {
    const { data: activeItems, error: iErr } = await admin
      .from('items')
      .select('id')
      .eq('is_active', true)
      .in('id', itemIdsToValidate)
    if (iErr) throw new Error(iErr.message)
    const active = new Set<number>((activeItems ?? []).map((r: { id: number | string }) => Number(r.id)))
    const missing = itemIdsToValidate.filter((id) => !active.has(id))
    if (missing.length) {
      throw new Error(`Cannot stock out: mapped inventory item(s) missing/inactive: ${missing.join(', ')}`)
    }
  }

  const depletedItemIds = new Set<number>()
  const alwaysIncludeVariantIds = new Set<number>()
  const templateIdsNeedingLines = new Set<number>()
  const pillowKeysFromCommit: Array<{ kind: string; size: string }> = []
  const bolsterVariantsFromCommit: string[] = []

  // Commit each line (template required for pillow/bolster). After committing, move to archived.
  for (const c of parsed.commits) {
    const row = byId.get(c.queueId)
    if (!row) throw new Error(`Queue row not found: ${c.queueId}`)
    if (row.status !== 'pending') continue

    const variantId = row.shopify_variant_id == null ? null : Number(row.shopify_variant_id)
    if (variantId && Number.isFinite(variantId) && variantId > 0) alwaysIncludeVariantIds.add(variantId)

    const commitMeta: ShopifyCommitMeta = {
      shopify_queue_id: c.queueId,
      shopify_order_id: Number(row.shopify_order_id),
      shopify_line_item_id: row.shopify_line_item_id == null ? null : Number(row.shopify_line_item_id),
    }

    if (row.kind === 'part') {
      if (!row.item_id) throw new Error(`Missing item_id for part row ${c.queueId}`)
      const { skipped } = await sellPartForShopifyCommit(admin, {
        itemId: Number(row.item_id),
        quantity: Number(row.quantity),
        ...commitMeta,
      })
      if (!skipped) depletedItemIds.add(Number(row.item_id))
    } else if (c.replaceLines?.length) {
      const { skipped } = await sellFromReplaceLinesForShopifyCommit(admin, {
        lines: c.replaceLines,
        quantity: Number(row.quantity),
        ...commitMeta,
      })
      if (!skipped) {
        c.replaceLines.forEach((l) => depletedItemIds.add(l.item_id))
        if (row.kind === 'pillow' && row.pillow_size) {
          pillowKeysFromCommit.push({ kind: String(row.pillow_kind || 'basic'), size: String(row.pillow_size) })
        }
        if (row.kind === 'bolster' && row.bolster_variant) {
          bolsterVariantsFromCommit.push(String(row.bolster_variant))
        }
      }
    } else {
      if (!c.templateId) throw new Error(`Template is required for ${row.kind} row ${c.queueId}`)
      const { skipped } = await sellFromTemplateForShopifyCommit(admin, {
        templateId: c.templateId,
        quantity: Number(row.quantity),
        ...commitMeta,
      })
      if (!skipped) {
        templateIdsNeedingLines.add(c.templateId)
        if (row.kind === 'pillow' && row.pillow_size) {
          pillowKeysFromCommit.push({ kind: String(row.pillow_kind || 'basic'), size: String(row.pillow_size) })
        }
        if (row.kind === 'bolster' && row.bolster_variant) {
          bolsterVariantsFromCommit.push(String(row.bolster_variant))
        }
      }
    }

    const archivePatch = c.replaceLines?.length
      ? {
          status: 'archived' as const,
          chosen_template_id: null,
          committed_at: new Date().toISOString(),
          metadata: { replace_lines: c.replaceLines },
        }
      : {
          status: 'archived' as const,
          chosen_template_id: c.templateId,
          committed_at: new Date().toISOString(),
        }

    const { error: upErr } = await admin
      .from('shopify_sales_queue')
      .update(archivePatch)
      .eq('id', c.queueId)
      .eq('status', 'pending')
    if (upErr) throw new Error(upErr.message)
  }

  if (templateIdsNeedingLines.size) {
    const { data: tLines, error: tlErr } = await admin
      .from('bom_template_lines')
      .select('item_id')
      .in('template_id', Array.from(templateIdsNeedingLines))
    if (tlErr) throw new Error(tlErr.message)
    ;(tLines ?? []).forEach((r: { item_id: number | string }) => {
      const id = Number(r.item_id)
      if (Number.isFinite(id) && id > 0) depletedItemIds.add(id)
    })
  }

  // Altered fillings stock out from their base item — include both ids for BOM/part matching.
  const depletedRaw = Array.from(depletedItemIds)
  if (depletedRaw.length) {
    const effectiveById = await resolveEffectiveStockItemIds(admin, depletedRaw)
    for (const [original, effective] of effectiveById) {
      depletedItemIds.add(original)
      depletedItemIds.add(effective)
    }
  }

  // Supabase is source of truth — return immediately. Shopify is a background mirror.
  const depleted = Array.from(depletedItemIds)
  const variants = Array.from(alwaysIncludeVariantIds)
  if (depleted.length || variants.length || pillowKeysFromCommit.length || bolsterVariantsFromCommit.length) {
    after(() => {
      void syncShopifyInventoryForDepletedItems({
        depletedItemIds: depleted,
        alwaysIncludeVariantIds: variants,
        pillowKeys: pillowKeysFromCommit,
        bolsterVariants: bolsterVariantsFromCommit,
      }).catch((e) => {
        console.error('[shopify-sync] scoped push after commit failed (non-fatal)', e)
      })
    })
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

const ItemImageSchema = z.object({
  itemId: z.number().int().positive(),
  assetId: z.string().uuid().nullable(),
})

/** Slice 12: link an Item to its primary Media Asset (add-on card imagery). */
export async function setItemPrimaryImage(input: z.infer<typeof ItemImageSchema>) {
  const parsed = ItemImageSchema.parse(input)
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('items')
    .update({ primary_media_asset_id: parsed.assetId })
    .eq('id', parsed.itemId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Item not found or already inactive')
  return { ok: true }
}

export async function addInventoryItem(input: z.infer<typeof AddItemSchema>) {
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
          const { error: stockErr } = await admin.from('inventory_transactions').insert({
            item_id: revived.id,
            quantity_signed: parsed.initialStock,
            reason: 'receive',
          })
          if (stockErr) throw new Error(stockErr.message)
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
  await assertAdmin('inventory')
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
  await assertAdmin('inventory')
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
  await assertAdmin('inventory')
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
  await assertAdmin('inventory')
  const id = ShopifyVariantIdSchema.parse(shopifyVariantId)
  const admin = supabaseAdmin()
  const { error } = await admin.from('shopify_variant_mappings').delete().eq('shopify_variant_id', id)
  if (error) throw new Error(error.message)
  scheduleMirrorReResolve([id])
  return { ok: true }
}
