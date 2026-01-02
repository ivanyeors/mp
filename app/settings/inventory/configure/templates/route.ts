import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const KindSchema = z.enum(['pillow', 'bolster'])
const PillowKindSchema = z.enum(['basic', 'premium'])

const ListSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
})

const CreateSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() })).default([]),
})

const DeleteSchema = z.object({ templateId: z.number().int().positive() })

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parsed = ListSchema.safeParse({
    kind: searchParams.get('kind'),
    key: searchParams.get('key'),
    pillowKind: searchParams.get('pillowKind'),
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const pillowKind =
    parsed.data.kind === 'pillow'
      ? (parsed.data.pillowKind ?? 'basic')
      : null

  const admin = supabaseAdmin()
  let q = admin
    .from('bom_templates')
    .select('id,kind,key,name,notes,created_at,updated_at')
    .eq('kind', parsed.data.kind)
    .eq('key', parsed.data.key)
    .order('updated_at', { ascending: false })

  if (parsed.data.kind === 'pillow') q = q.eq('pillow_kind', pillowKind)
  else q = q.is('pillow_kind', null)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null)
  const parsed = CreateSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { kind, key, name, notes, lines } = parsed.data
  const pillowKind = kind === 'pillow' ? (parsed.data.pillowKind ?? 'basic') : null

  const { data: template, error: insErr } = await admin
    .from('bom_templates')
    .insert({ kind, key, pillow_kind: pillowKind, name, notes: notes ?? null })
    .select('id,kind,key,name,notes,created_at,updated_at')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  if (lines.length) {
    const payload = lines.map((l) => ({ template_id: template.id, item_id: l.item_id, quantity: l.quantity }))
    const { error: linesErr } = await admin.from('bom_template_lines').upsert(payload, { onConflict: 'template_id,item_id' })
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, template })
}

export async function DELETE(req: NextRequest) {
  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin.from('bom_templates').delete().eq('id', parsed.data.templateId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}


