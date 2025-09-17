"use server";

import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'

const SellPillowSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() })
const ItemQtySchema = z.object({ itemId: z.number().int().positive(), quantity: z.number().int().positive() })
const SellBolsterSchema = z.object({
  quantity: z.number().int().positive(),
  components: z.object({
    caseQty: z.number().int().positive().default(1),
    protectorQty: z.number().int().positive().default(1),
    fillingQty: z.number().int().positive().default(1),
  }).optional(),
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
  if (blErr) throw new Error(blErr.message)

  let effectiveLines = (lines ?? []).map(l => ({ item_id: l.item_id, quantity: Number(l.quantity) }))

  if (!effectiveLines.length) {
    // Fallback to legacy implicit mapping if DB not configured yet
    type IdRow = { id: number }
    const { data: caseItem } = await admin.from('items').select('id').eq('category', 'case').eq('size', 'Bolster').limit(1).maybeSingle()
    const { data: protectorItem } = await admin.from('items').select('id').eq('category', 'protector').eq('size', 'Bolster').limit(1).maybeSingle()
    const { data: fillingItem } = await admin.from('items').select('id').eq('category', 'filling').eq('subtype', '6D-L').limit(1).maybeSingle()
    const prelim = [caseItem, protectorItem, fillingItem].filter((r): r is IdRow => !!r)
    effectiveLines = prelim.map((r) => ({ item_id: r.id, quantity: 1 }))
  }

  const txns = effectiveLines.map(l => ({ item_id: l.item_id, quantity_signed: -1 * parsed.quantity * Number(l.quantity), reason: 'sale' as const }))

  const { error: insErr } = await admin.from('inventory_transactions').insert(txns)
  if (insErr) throw new Error(insErr.message)
  return { ok: true }
}
