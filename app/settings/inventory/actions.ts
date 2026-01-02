"use server";

import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'
import { syncShopifyInventoryFromBuildable } from '@/lib/shopify/sync'

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

const ITEM_CATEGORIES = ['cover','case','protector','filling','packaging','accessories','other'] as const
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
  if (['cover', 'case', 'protector', 'filling'].includes(value.category) && (!normalizedSize || normalizedSize === '-')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Size is required for covers, cases, protectors, and fillings',
      path: ['size'],
    })
  }
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
    const { data: caseItem } = await admin.from('items').select('id').eq('category', 'case').eq('size', 'Bolster').limit(1).maybeSingle()
    const { data: protectorItem } = await admin.from('items').select('id').eq('category', 'protector').eq('size', 'Bolster').limit(1).maybeSingle()
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

export async function listTemplates(kind: 'pillow' | 'bolster', key: string, pillowKind?: 'basic' | 'premium') {
  const admin = supabaseAdmin()
  const effectivePillowKind = kind === 'pillow' ? (pillowKind ?? 'basic') : null

  let q = admin
    .from('bom_templates')
    .select('id,name,kind,key,pillow_kind')
    .eq('kind', kind)
    .eq('key', key)
    .order('updated_at', { ascending: false })

  if (kind === 'pillow') q = q.eq('pillow_kind', effectivePillowKind)
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
      ? (['cover', 'case', 'protector', 'filling'].includes(parsed.category) ? rawSize.toUpperCase() : rawSize)
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
