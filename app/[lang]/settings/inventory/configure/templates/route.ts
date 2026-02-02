import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const KindSchema = z.enum(['pillow', 'bolster'])
const PillowKindSchema = z.enum(['basic', 'premium'])
const PillowVariantSchema = z.enum(['linen', 'fibrecool'])

const ListSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
  pillowVariant: PillowVariantSchema.optional(),
})

const CreateSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
  pillowVariant: PillowVariantSchema.optional(),
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() })).default([]),
})

const DeleteSchema = z.object({ templateId: z.number().int().positive() })

function dedupeLines<T extends { item_id: number; quantity: number }>(
  lines: T[],
): Array<{ item_id: number; quantity: number }> {
  const m = new Map<number, number>()
  for (const l of lines) m.set(Number(l.item_id), Number(l.quantity))
  return Array.from(m.entries()).map(([item_id, quantity]) => ({ item_id, quantity }))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // URLSearchParams.get() returns `null` for missing keys; Zod optional() expects undefined, not null.
  const pillowKindParam = searchParams.get('pillowKind') ?? undefined
  const pillowVariantParam = searchParams.get('pillowVariant') ?? undefined
  const parsed = ListSchema.safeParse({
    kind: searchParams.get('kind'),
    key: searchParams.get('key'),
    pillowKind: pillowKindParam,
    pillowVariant: pillowVariantParam,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const pillowKind =
    parsed.data.kind === 'pillow'
      ? (parsed.data.pillowKind ?? 'basic')
      : null
  const pillowVariant =
    parsed.data.kind === 'pillow' && pillowKind === 'premium'
      ? (parsed.data.pillowVariant ?? null)
      : null

  const admin = supabaseAdmin()
  let q = admin
    .from('bom_templates')
    .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
    .eq('kind', parsed.data.kind)
    .eq('key', parsed.data.key)
    .order('updated_at', { ascending: false })

  if (parsed.data.kind === 'pillow') {
    q = q.eq('pillow_kind', pillowKind)
    if (pillowKind === 'premium' && pillowVariant) {
      q = q.eq('pillow_variant', pillowVariant)
    }
  }
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
  const pillowVariant = kind === 'pillow' && pillowKind === 'premium' ? (parsed.data.pillowVariant ?? null) : null

  // If a template already exists for the same (kind,key,pillow_kind,pillow_variant,name),
  // update it in-place instead of failing the unique constraint or creating duplicates.
  // This matches the UI expectation that re-saving with the same name "updates" the template.
  let existingQuery = admin
    .from('bom_templates')
    .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
    .eq('kind', kind)
    .eq('key', key)
    .eq('name', name)

  if (kind === 'pillow') {
    existingQuery = existingQuery.eq('pillow_kind', pillowKind)
    if (pillowKind === 'premium' && pillowVariant) existingQuery = existingQuery.eq('pillow_variant', pillowVariant)
    else existingQuery = existingQuery.is('pillow_variant', null)
  } else {
    existingQuery = existingQuery.is('pillow_kind', null).is('pillow_variant', null)
  }

  const { data: existing, error: exErr } = await existingQuery.maybeSingle()
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  const safeLines = dedupeLines(lines)

  const templateId = existing?.id
  if (templateId) {
    const { data: updated, error: upErr } = await admin
      .from('bom_templates')
      .update({ notes: notes ?? null })
      .eq('id', templateId)
      .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
      .single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    // Replace lines for this template.
    const { error: delErr } = await admin.from('bom_template_lines').delete().eq('template_id', templateId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    if (safeLines.length) {
      const payload = safeLines.map((l) => ({ template_id: templateId, item_id: l.item_id, quantity: l.quantity }))
      const { error: linesErr } = await admin.from('bom_template_lines').upsert(payload, { onConflict: 'template_id,item_id' })
      if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, template: updated, updatedExisting: true })
  }

  const { data: created, error: insErr } = await admin
    .from('bom_templates')
    .insert({ kind, key, pillow_kind: pillowKind, pillow_variant: pillowVariant, name, notes: notes ?? null })
    .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  if (safeLines.length) {
    const payload = safeLines.map((l) => ({ template_id: created.id, item_id: l.item_id, quantity: l.quantity }))
    const { error: linesErr } = await admin.from('bom_template_lines').upsert(payload, { onConflict: 'template_id,item_id' })
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, template: created, updatedExisting: false })
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


