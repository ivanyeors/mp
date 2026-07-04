import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { z } from 'zod'
import { validateFillingOnlyLines } from '@/lib/filling-templates'
import { lookupItemCategories, rejectFillingLines } from '@/lib/bom-sanitizer'

export const runtime = 'nodejs'

const TEMPLATE_SELECT =
  'id,kind,key,pillow_kind,pillow_variant,name,notes,role,is_active,created_at,updated_at'

function dedupeLines<T extends { item_id: number; quantity: number }>(lines: T[]): Array<{ item_id: number; quantity: number }> {
  const m = new Map<number, number>()
  for (const l of lines) m.set(Number(l.item_id), Number(l.quantity))
  return Array.from(m.entries()).map(([item_id, quantity]) => ({ item_id, quantity }))
}

async function assertFillingLines(
  admin: ReturnType<typeof supabaseAdmin>,
  lines: Array<{ item_id: number; quantity: number }>,
): Promise<string | null> {
  if (!lines.length) return null
  const ids = lines.map((l) => l.item_id)
  const { data, error } = await admin.from('items').select('id,category').in('id', ids)
  if (error) return error.message
  const byId = new Map((data ?? []).map((r: { id: number; category: string }) => [r.id, r.category]))
  const withCat = lines.map((l) => ({
    item_id: l.item_id,
    category: byId.get(l.item_id) ?? 'unknown',
  }))
  const missing = withCat.filter((l) => !byId.has(l.item_id))
  if (missing.length) {
    return `Unknown item_id: ${missing.map((m) => m.item_id).join(', ')}`
  }
  const result = validateFillingOnlyLines(withCat)
  return result.ok ? null : result.error
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select(TEMPLATE_SELECT)
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

const UpdateSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  is_active: z.boolean().optional(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() })).optional(),
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
    .select('id,notes,role,is_active')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const nextNotes = parsed.data.notes !== undefined ? parsed.data.notes : (tpl.notes ?? null)
  const nextActive = parsed.data.is_active !== undefined ? parsed.data.is_active : tpl.is_active

  const { error: upErr } = await admin
    .from('bom_templates')
    .update({ notes: nextNotes, is_active: nextActive })
    .eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  if (parsed.data.lines !== undefined) {
    const safeLines = dedupeLines(parsed.data.lines)
    if (tpl.role === 'filling') {
      const err = await assertFillingLines(admin, safeLines)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    } else if (safeLines.length) {
      const cats = await lookupItemCategories(admin, safeLines.map((l) => l.item_id))
      if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 })
      const withCat = safeLines.map((l) => ({
        item_id: l.item_id,
        category: cats.byId.get(l.item_id) ?? 'unknown',
      }))
      const rejected = rejectFillingLines(withCat)
      if (!rejected.ok) return NextResponse.json({ error: rejected.error }, { status: 400 })
    }

    const { error: delErr } = await admin.from('bom_template_lines').delete().eq('template_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (safeLines.length) {
      const payload = safeLines.map((l) => ({ template_id: id, item_id: l.item_id, quantity: l.quantity }))
      const { error: linesErr } = await admin.from('bom_template_lines').upsert(payload, { onConflict: 'template_id,item_id' })
      if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
