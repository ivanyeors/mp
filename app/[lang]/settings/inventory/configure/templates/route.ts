import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { validateFillingOnlyLines } from '@/lib/filling-templates'
import { normalizeTemplateKeys } from '@/lib/filling-templates/keys'
import {
  assertTemplateNameFree,
  loadTemplateKeys,
  setTemplateKeys,
  templateIdsForKey,
} from '@/lib/filling-templates/membership'
import { lookupItemCategories, rejectFillingLines } from '@/lib/bom-sanitizer'
import { loadDimensionOverrides } from '@/lib/spatial-fillings/dimension-overrides.server'
import type { DimensionOverridesPayload } from '@/lib/spatial-fillings/dimension-overrides'

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
  notes: z.string().trim().max(2000).optional(),
  // Filling Templates may serve several sizes; defaults to the creating scope.
  keys: z.array(z.string().min(1).max(40)).optional(),
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
    .eq('role', role)
    .order('updated_at', { ascending: false })

  // Filling Templates are scoped by MEMBERSHIP, not by `key` — that column only
  // carries the primary, so filtering on it would hide every template shared in
  // from another size. Warehouse templates keep the size×tier key scope.
  let memberIds: number[] | null = null
  if (role === 'filling') {
    const members = await templateIdsForKey(admin, parsed.data.key)
    if (!members.ok) return NextResponse.json({ error: members.error }, { status: 500 })
    memberIds = members.ids
    if (memberIds.length) q = q.in('id', memberIds)
    if (parsed.data.activeOnly) q = q.eq('is_active', true)
  } else {
    q = q.eq('key', parsed.data.key)
    if (parsed.data.kind === 'pillow') {
      const pillowKind = parsed.data.pillowKind ?? 'basic'
      q = q.eq('pillow_kind', pillowKind)
      if (pillowKind === 'premium' && parsed.data.pillowVariant) {
        q = q.eq('pillow_variant', parsed.data.pillowVariant)
      }
    } else {
      q = q.is('pillow_kind', null)
    }
  }

  // No template serves this size yet: skip the list query (an empty `in` is not
  // a filter PostgREST can express) but still ship the colours below, which a
  // brand-new template needs before it has been saved once.
  const { data, error } = memberIds && !memberIds.length ? { data: [], error: null } : await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const templates = data ?? []

  // Every size each listed template serves, so the list can show what a save or
  // a delete would reach beyond the size being viewed.
  let templateKeys: Record<number, string[]> | undefined
  if (role === 'filling') {
    const ids = templates.map((t: { id: number }) => Number(t.id))
    const loaded = await loadTemplateKeys(admin, ids)
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
    templateKeys = Object.fromEntries(ids.map((id) => [id, loaded.byId.get(id) ?? []]))
  }

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

  // Per-subtype x-ray colours are global, not per-template, so they ride the list
  // response: without this the editor renders code defaults until a template is
  // opened, and a brand-new template never gets them at all. Service-role-only
  // under RLS, so the browser cannot fetch them itself.
  let colorOverrides: Array<{ subtype: string; color: string }> | undefined
  let dimensionOverrides: DimensionOverridesPayload | undefined
  if (role === 'filling' && parsed.data.kind === 'pillow') {
    const { data: colors, error: colorErr } = await admin
      .from('filling_color_overrides')
      .select('subtype,color')
    if (colorErr) return NextResponse.json({ error: colorErr.message }, { status: 500 })
    colorOverrides = colors ?? []
    // Slice 02/12: the dimension overrides ride beside the colours, same reason.
    try {
      dimensionOverrides = await loadDimensionOverrides(admin)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    templates,
    ...(templateKeys ? { templateKeys } : {}),
    ...(sectionCoverage ? { sectionCoverage } : {}),
    ...(colorOverrides ? { colorOverrides } : {}),
    ...(dimensionOverrides ? { dimensionOverrides } : {}),
  })
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
  // Sizes this Filling Template will serve. Defaults to the creating scope, so
  // a caller that knows nothing about membership still gets today's behaviour.
  let fillingKeys: string[] = []
  if (role === 'filling') {
    const normalized = normalizeTemplateKeys(kind, parsed.data.keys ?? [key])
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 })
    if (!normalized.keys.includes(key)) {
      return NextResponse.json(
        { error: `A template created at ${key} must also apply to ${key}` },
        { status: 400 },
      )
    }
    fillingKeys = normalized.keys
  }
  // Whether the caller asked for a membership at all. When this create lands on
  // an existing shared template, an absent `keys` must leave its sizes alone —
  // defaulting to [key] would let a create-shaped call silently drop every
  // other size's recipe with a 200.
  const keysRequested = role === 'filling' && parsed.data.keys !== undefined
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
    .eq('name', name)
    .eq('role', role)

  if (role === 'filling') {
    // Same name already serving this size = the same template, whatever its
    // primary key says. Matching on `key` would fork a duplicate the moment a
    // shared template's primary moved to a smaller size.
    const members = await templateIdsForKey(admin, key)
    if (!members.ok) return NextResponse.json({ error: members.error }, { status: 500 })
    if (!members.ids.length) existingQuery = existingQuery.eq('id', -1)
    else existingQuery = existingQuery.in('id', members.ids)
  } else {
    existingQuery = existingQuery.eq('key', key)
  }

  if (role === 'warehouse' && kind === 'pillow') {
    existingQuery = existingQuery.eq('pillow_kind', pillowKind)
    if (pillowKind === 'premium' && pillowVariant) existingQuery = existingQuery.eq('pillow_variant', pillowVariant)
    else existingQuery = existingQuery.is('pillow_variant', null)
  } else if (role === 'warehouse') {
    existingQuery = existingQuery.is('pillow_kind', null).is('pillow_variant', null)
  }

  const { data: existing, error: exErr } = await existingQuery.maybeSingle()
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  if (role === 'filling') {
    const free = await assertTemplateNameFree(admin, {
      kind,
      keys: fillingKeys,
      name,
      excludeId: existing?.id ? Number(existing.id) : undefined,
    })
    if (!free.ok) return NextResponse.json({ error: free.error }, { status: 409 })
  }

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

    if (role === 'filling') {
      const current = await loadTemplateKeys(admin, [Number(templateId)])
      if (!current.ok) return NextResponse.json({ error: current.error }, { status: 500 })
      const existingKeys = current.byId.get(Number(templateId)) ?? []
      const nextKeys = keysRequested ? fillingKeys : [...new Set([...existingKeys, key])]
      const membership = await setTemplateKeys(admin, { templateId, kind, keys: nextKeys })
      if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 })
      return NextResponse.json({ ok: true, template: updated, keys: membership.keys, updatedExisting: true })
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

  if (role === 'filling') {
    const membership = await setTemplateKeys(admin, { templateId: created.id, kind, keys: fillingKeys })
    if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 })
    return NextResponse.json({ ok: true, template: created, keys: membership.keys, updatedExisting: false })
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
