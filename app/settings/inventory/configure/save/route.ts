import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'

const BodySchema = z.object({
  productId: z.number().int().positive(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() }))
})

const BolsterBodySchema = z.object({
  kind: z.literal('bolster'),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() }))
})

export async function POST(req: NextRequest) {
  const json = await req.json()
  // Two modes: standard pillow product BOM, or bolster pseudo-product using size='Bolster'
  const bolsterParsed = BolsterBodySchema.safeParse(json)
  if (bolsterParsed.success) {
    const { lines } = bolsterParsed.data
    const admin = supabaseAdmin()
    // Replace all bolster lines
    const { error: delErr } = await admin.from('bolster_bom_lines').delete().neq('id', 0)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    if (lines.length) {
      const upserts = lines.map(l => ({ item_id: l.item_id, quantity: l.quantity }))
      const { error: upErr } = await admin.from('bolster_bom_lines').upsert(upserts, { onConflict: 'item_id' })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { productId, lines } = parsed.data

  const admin = supabaseAdmin()
  const { data: existing, error: selErr } = await admin
    .from('bom_lines')
    .select('id,item_id')
    .eq('product_id', productId)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

  const keepIds = new Set(lines.map(l => l.item_id))
  const toDelete = (existing ?? []).filter(r => !keepIds.has(r.item_id)).map(r => r.id)

  if (toDelete.length) {
    const { error: delErr } = await admin.from('bom_lines').delete().in('id', toDelete)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  if (lines.length) {
    const upserts = lines.map(l => ({ product_id: productId, item_id: l.item_id, quantity: l.quantity }))
    const { error: upErr } = await admin.from('bom_lines').upsert(upserts, { onConflict: 'product_id,item_id' })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
