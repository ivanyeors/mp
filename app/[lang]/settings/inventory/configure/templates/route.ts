import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { validateFillingOnlyLines } from '@/lib/filling-templates'
import { lookupItemCategories, rejectFillingLines } from '@/lib/bom-sanitizer'

export const runtime = 'nodejs'

const KindSchema = z.enum(['pillow', 'bolster'])
const PillowKindSchema = z.enum(['basic', 'premium'])
const PillowVariantSchema = z.enum(['linen', 'fibrecool'])
const RoleSchema = z.enum(['warehouse', 'filling'])

const TEMPLATE_SELECT =
  'id,kind,key,pillow_kind,pillow_variant,name,notes,role,is_active,created_at,updated_at'

const ListSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
  pillowVariant: PillowVariantSchema.optional(),
  role: RoleSchema.default('warehouse'),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

const CreateSchema = z.object({
  kind: KindSchema,
  key: z.string().min(1).max(40),
  pillowKind: PillowKindSchema.optional(),
  pillowVariant: PillowVariantSchema.optional(),
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).optional(),
  role: RoleSchema.default('warehouse'),
  is_active: z.boolean().optional(),
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

export async function GET(req: NextRequest) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const pillowKindParam = searchParams.get('pillowKind') ?? undefined
  const pillowVariantParam = searchParams.get('pillowVariant') ?? undefined
  const roleParam = searchParams.get('role') ?? undefined
  const activeOnlyParam = searchParams.get('activeOnly') ?? undefined
  const parsed = ListSchema.safeParse({
    kind: searchParams.get('kind'),
    key: searchParams.get('key'),
    pillowKind: pillowKindParam,
    pillowVariant: pillowVariantParam,
    role: roleParam ?? undefined,
    activeOnly: activeOnlyParam ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const role = parsed.data.role
  const admin = supabaseAdmin()
  let q = admin
    .from('bom_templates')
    .select(TEMPLATE_SELECT)
    .eq('kind', parsed.data.kind)
    .eq('key', parsed.data.key)
    .eq('role', role)
    .order('updated_at', { ascending: false })

  if (role === 'filling') {
    if (parsed.data.activeOnly) q = q.eq('is_active', true)
  } else if (parsed.data.kind === 'pillow') {
    const pillowKind = parsed.data.pillowKind ?? 'basic'
    q = q.eq('pillow_kind', pillowKind)
    if (pillowKind === 'premium' && parsed.data.pillowVariant) {
      q = q.eq('pillow_variant', parsed.data.pillowVariant)
    }
  } else {
    q = q.is('pillow_kind', null)
  }

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const templates = data ?? []

  // Section coverage per pillow Filling Template, so the list can badge the ones
  // that are not Spatially authored (CONTEXT.md) without fetching every placement
  // row. One `in` query for the whole page — never one per template. Bolster has
  // no Section enum and is never evaluated (ADR 0008).
  let sectionCoverage: Record<number, string[]> | undefined
  if (role === 'filling' && parsed.data.kind === 'pillow' && templates.length) {
    const ids = templates.map((t: { id: number }) => Number(t.id))
    const { data: cov, error: covErr } = await admin
      .from('filling_template_placements')
      .select('template_id,section')
      .in('template_id', ids)
    if (covErr) return NextResponse.json({ error: covErr.message }, { status: 500 })
    const bySection = new Map<number, Set<string>>()
    for (const row of (cov ?? []) as Array<{ template_id: number; section: string }>) {
      const id = Number(row.template_id)
      const set = bySection.get(id) ?? new Set<string>()
      set.add(row.section)
      bySection.set(id, set)
    }
    sectionCoverage = Object.fromEntries(ids.map((id) => [id, [...(bySection.get(id) ?? [])]]))
  }

  return NextResponse.json({ ok: true, templates, ...(sectionCoverage ? { sectionCoverage } : {}) })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = CreateSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { kind, key, name, notes, lines, role } = parsed.data
  const isActive = parsed.data.is_active ?? true
  // Filling templates are size-scoped only (no tier).
  const pillowKind = role === 'filling' ? null : kind === 'pillow' ? (parsed.data.pillowKind ?? 'basic') : null
  const pillowVariant =
    role === 'filling'
      ? null
      : kind === 'pillow' && pillowKind === 'premium'
        ? (parsed.data.pillowVariant ?? null)
        : null

  const safeLines = dedupeLines(lines)

  if (role === 'filling') {
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

  let existingQuery = admin
    .from('bom_templates')
    .select(TEMPLATE_SELECT)
    .eq('kind', kind)
    .eq('key', key)
    .eq('name', name)
    .eq('role', role)

  if (role === 'warehouse' && kind === 'pillow') {
    existingQuery = existingQuery.eq('pillow_kind', pillowKind)
    if (pillowKind === 'premium' && pillowVariant) existingQuery = existingQuery.eq('pillow_variant', pillowVariant)
    else existingQuery = existingQuery.is('pillow_variant', null)
  } else if (role === 'warehouse') {
    existingQuery = existingQuery.is('pillow_kind', null).is('pillow_variant', null)
  }

  const { data: existing, error: exErr } = await existingQuery.maybeSingle()
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  const templateId = existing?.id
  if (templateId) {
    const { data: updated, error: upErr } = await admin
      .from('bom_templates')
      .update({ notes: notes ?? null, is_active: isActive })
      .eq('id', templateId)
      .select(TEMPLATE_SELECT)
      .single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

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
    .insert({
      kind,
      key,
      pillow_kind: pillowKind,
      pillow_variant: pillowVariant,
      name,
      notes: notes ?? null,
      role,
      is_active: isActive,
    })
    .select(TEMPLATE_SELECT)
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
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin.from('bom_templates').delete().eq('id', parsed.data.templateId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
