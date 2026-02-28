import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return { message: String(err ?? 'Unknown error') }
  const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  return {
    message: typeof e.message === 'string' ? e.message : 'Unknown error',
    details: typeof e.details === 'string' ? e.details : null,
    hint: typeof e.hint === 'string' ? e.hint : null,
    code: typeof e.code === 'string' ? e.code : null,
  }
}

function dedupeLines<T extends { item_id: number; quantity: number }>(lines: T[]): Array<{ item_id: number; quantity: number }> {
  // Defensive: avoid Postgres "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // if the client sends duplicate item_id entries in a single request.
  const m = new Map<number, number>()
  for (const l of lines) m.set(Number(l.item_id), Number(l.quantity))
  return Array.from(m.entries()).map(([item_id, quantity]) => ({ item_id, quantity }))
}

const BodySchema = z.object({
  productId: z.number().int().positive(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() }))
})

const BolsterBodySchema = z.object({
  kind: z.literal('bolster'),
  variant: z.enum(['short','medium','long']).default('medium'),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() }))
})

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null)
  if (!json) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  // Two modes: standard pillow product BOM, or bolster pseudo-product using size='Bolster'
  const bolsterParsed = BolsterBodySchema.safeParse(json)
  if (bolsterParsed.success) {
    const { lines, variant } = bolsterParsed.data
    const safeLines = dedupeLines(lines)
    const admin = supabaseAdmin()
    // Replace lines for this variant only
    const { error: delErr } = await admin.from('bolster_bom_lines').delete().eq('variant', variant)
    if (delErr) {
      console.error('save/bolster delete failed', formatSupabaseError(delErr))
      return NextResponse.json({ error: formatSupabaseError(delErr) }, { status: 500 })
    }
    if (safeLines.length) {
      const upserts = safeLines.map(l => ({ variant, item_id: l.item_id, quantity: l.quantity }))
      const { error: upErr } = await admin.from('bolster_bom_lines').upsert(upserts, { onConflict: 'variant,item_id' })
      if (upErr) {
        console.error('save/bolster upsert failed', formatSupabaseError(upErr))
        return NextResponse.json({ error: formatSupabaseError(upErr) }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { productId, lines } = parsed.data
  const safeLines = dedupeLines(lines)

  const admin = supabaseAdmin()
  const { data: existing, error: selErr } = await admin
    .from('bom_lines')
    .select('id,item_id')
    .eq('product_id', productId)
  if (selErr) {
    console.error('save/pillow select failed', { productId, ...formatSupabaseError(selErr) })
    return NextResponse.json({ error: formatSupabaseError(selErr) }, { status: 500 })
  }

  const keepIds = new Set(safeLines.map(l => l.item_id))
  const toDelete = (existing ?? []).filter(r => !keepIds.has(r.item_id)).map(r => r.id)

  if (toDelete.length) {
    const { error: delErr } = await admin.from('bom_lines').delete().in('id', toDelete)
    if (delErr) {
      console.error('save/pillow delete failed', { productId, toDeleteCount: toDelete.length, ...formatSupabaseError(delErr) })
      return NextResponse.json({ error: formatSupabaseError(delErr) }, { status: 500 })
    }
  }

  if (safeLines.length) {
    const upserts = safeLines.map(l => ({ product_id: productId, item_id: l.item_id, quantity: l.quantity }))
    const { error: upErr } = await admin.from('bom_lines').upsert(upserts, { onConflict: 'product_id,item_id' })
    if (upErr) {
      console.error('save/pillow upsert failed', { productId, upsertCount: upserts.length, ...formatSupabaseError(upErr) })
      return NextResponse.json({ error: formatSupabaseError(upErr) }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
