import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', id)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, template: tpl, lines: lines ?? [] })
}

function dedupeLines<T extends { item_id: number; quantity: number }>(lines: T[]): Array<{ item_id: number; quantity: number }> {
  const m = new Map<number, number>()
  for (const l of lines) m.set(Number(l.item_id), Number(l.quantity))
  return Array.from(m.entries()).map(([item_id, quantity]) => ({ item_id, quantity }))
}

const UpdateSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() })).default([]),
})

export async function PUT(req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const json = await req.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()

  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,notes')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const nextNotes = parsed.data.notes ?? (tpl.notes ?? null)
  // Bump updated_at (trigger) and keep notes in sync if provided.
  const { error: upErr } = await admin.from('bom_templates').update({ notes: nextNotes }).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const safeLines = dedupeLines(parsed.data.lines)
  const { error: delErr } = await admin.from('bom_template_lines').delete().eq('template_id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (safeLines.length) {
    const payload = safeLines.map((l) => ({ template_id: id, item_id: l.item_id, quantity: l.quantity }))
    const { error: linesErr } = await admin.from('bom_template_lines').upsert(payload, { onConflict: 'template_id,item_id' })
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}


