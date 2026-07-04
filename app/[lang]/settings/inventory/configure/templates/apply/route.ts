import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { lookupItemCategories, stripFillingLines } from '@/lib/bom-sanitizer'

export const runtime = 'nodejs'

const ApplySchema = z.object({
  templateId: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null)
  const parsed = ApplySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()

  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,pillow_kind,role')
    .eq('id', parsed.data.templateId)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  // Filling Templates are sale-path only; warehouse Apply uses role=warehouse templates.
  if (tpl.role === 'filling') {
    return NextResponse.json(
      { error: 'Filling Templates cannot be applied to the active warehouse BOM' },
      { status: 400 },
    )
  }

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', tpl.id)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  type LineRow = { item_id: number | string; quantity: number | string }
  const rawLines = (lines ?? []) as LineRow[]
  const normalized = rawLines.map((r) => ({
    item_id: Number(r.item_id),
    quantity: Number(r.quantity),
  }))
  const cats = await lookupItemCategories(
    admin,
    normalized.map((l) => l.item_id),
  )
  if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 })
  const safeLines = stripFillingLines(normalized, cats.byId)

  if (tpl.kind === 'pillow') {
    // Apply to the active BOM for the pillow size (key is XS/S/M/L/XL)
    const { data: product, error: pErr } = await admin
      .from('pillow_products')
      .select('id,size')
      .eq('size', tpl.key)
      .eq('kind', tpl.pillow_kind ?? 'basic')
      .eq('is_active', true)
      .maybeSingle()
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!product?.id) return NextResponse.json({ error: `No active pillow product found for size ${tpl.key}` }, { status: 400 })

    // Replace bom_lines for this product_id
    const { error: delErr } = await admin.from('bom_lines').delete().eq('product_id', product.id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    const payload = safeLines.map((r) => ({
      product_id: product.id,
      item_id: Number(r.item_id),
      quantity: Number(r.quantity),
    }))
    if (payload.length) {
      const { error: upErr } = await admin.from('bom_lines').upsert(payload, { onConflict: 'product_id,item_id' })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  // tpl.kind === 'bolster' (key is short/medium/long)
  const { error: delErr } = await admin.from('bolster_bom_lines').delete().eq('variant', tpl.key)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const payload = safeLines.map((r) => ({
    variant: tpl.key,
    item_id: Number(r.item_id),
    quantity: Number(r.quantity),
  }))
  if (payload.length) {
    const { error: upErr } = await admin.from('bolster_bom_lines').upsert(payload, { onConflict: 'variant,item_id' })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}


