import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { z } from 'zod'
import { validateFillingOnlyLines } from '@/lib/filling-templates'
import { normalizeTemplateKeys } from '@/lib/filling-templates/keys'
import { assertTemplateNameFree, loadTemplateKeys, setTemplateKeys } from '@/lib/filling-templates/membership'
import { lookupItemCategories, lookupPlacementKinds, rejectFillingLines } from '@/lib/bom-sanitizer'
import { loadDimensionOverrides } from '@/lib/spatial-fillings/dimension-overrides.server'
import {
  derivePackList,
  MAX_LAYERS_PER_CELL,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
} from '@/lib/spatial-fillings'

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
  const denied = await requireAdmin('inventory')
  if (denied) return denied

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

  let placements: Array<{ item_id: number }> = []
  if (tpl.role === 'filling') {
    const table = tpl.kind === 'bolster' ? 'bolster_template_placements' : 'filling_template_placements'
    const cols = tpl.kind === 'bolster' ? 'slot,item_id' : 'section,sub_section,slot,item_id,row_index,insert_order'
    const { data: pl, error: pErr } = await admin.from(table).select(cols).eq('template_id', id).order('slot')
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    placements = (pl ?? []) as unknown as Array<{ item_id: number }>
  }
  // Pack list is derived: placements when present, legacy flat lines otherwise (ADR 0008)
  const packList = derivePackList(placements, lines ?? [])

  // Sizes this recipe serves — the editor warns before a save reaches the others.
  let keys: string[] = []
  if (tpl.role === 'filling') {
    const loaded = await loadTemplateKeys(admin, [id])
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
    keys = loaded.byId.get(id) ?? []
  }

  // Product Builder per-subtype colours for the x-ray CSS-variable pipeline. The
  // table is service-role-only under RLS, so the Admin Panel must receive them
  // from here — the browser client cannot query it (and must not be granted a
  // policy to). Same rows the staff-assist endpoint ships to the configurator,
  // so both surfaces render a pouch in the same colour.
  const { data: colorOverrides, error: cErr } = await admin
    .from('filling_color_overrides')
    .select('subtype,color')
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  // Slice 02/12: Settings dimension overrides, same route for the same reason.
  let dimensionOverrides
  try {
    dimensionOverrides = await loadDimensionOverrides(admin)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    template: tpl,
    keys,
    lines: lines ?? [],
    placements,
    packList,
    colorOverrides: colorOverrides ?? [],
    dimensionOverrides,
  })
}

// Shape gate only; the spatial-fillings lib does the semantic validation per kind.
// row_index is the piece's LAYER (0 = top/front). Bound derives from
// MAX_LAYERS_PER_CELL so it cannot drift from validatePillowPlacements or the
// `row_index between 0 and 4` DB constraint again — it was left at the retired
// two-value top/bottom lane long after the 2026-07-21 depth migration, and the
// per-cell piece cap it briefly borrowed is now five layers' worth, not one.
const MAX_STACK_DEPTH = MAX_LAYERS_PER_CELL - 1
const PlacementRowSchema = z.object({
  section: z.string().default(''),
  sub_section: z.string().default(''),
  slot: z.number().int(),
  item_id: z.number().int().positive(),
  row_index: z.number().int().min(0).max(MAX_STACK_DEPTH).nullable().optional(),
  // Insert order: 1-based per-Section assembly step; null = not authored.
  insert_order: z.number().int().min(1).nullable().optional(),
})

const UpdateSchema = z.object({
  // Rename: the list is where a template is recognised, so its name is editable
  // there. Order snapshots keep the name they were built with (ADR 0008), so a
  // rename never rewrites a Result's history.
  name: z.string().trim().min(1).max(120).optional(),
  // Sizes this Filling Template serves. Replaces the set wholesale; at least one.
  keys: z.array(z.string().min(1).max(40)).optional(),
  notes: z.string().trim().max(2000).optional(),
  is_active: z.boolean().optional(),
  lines: z.array(z.object({ item_id: z.number().int().positive(), quantity: z.number().int().positive() })).optional(),
  placements: z.array(PlacementRowSchema).optional(),
})

export async function PUT(req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const json = await req.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()

  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,notes,role,is_active')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const nextNotes = parsed.data.notes !== undefined ? parsed.data.notes : (tpl.notes ?? null)
  const nextActive = parsed.data.is_active !== undefined ? parsed.data.is_active : tpl.is_active
  const nextName = parsed.data.name !== undefined ? parsed.data.name : tpl.name

  // Rescope before the name lands, so a rename that also widens the template is
  // checked against every size it is about to appear in, not just today's.
  const kind = tpl.kind === 'bolster' ? 'bolster' : 'pillow'
  let nextKeys: string[] | null = null
  if (parsed.data.keys !== undefined) {
    if (tpl.role !== 'filling') {
      return NextResponse.json(
        { error: 'Only Filling Templates apply to more than one size' },
        { status: 400 },
      )
    }
    const normalized = normalizeTemplateKeys(kind, parsed.data.keys)
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 })
    nextKeys = normalized.keys
  }

  if (tpl.role === 'filling' && (nextKeys || parsed.data.name !== undefined)) {
    const loaded = await loadTemplateKeys(admin, [id])
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
    const free = await assertTemplateNameFree(admin, {
      kind,
      keys: nextKeys ?? loaded.byId.get(id) ?? [tpl.key],
      name: nextName,
      excludeId: id,
    })
    if (!free.ok) return NextResponse.json({ error: free.error }, { status: 409 })
  }

  const { error: upErr } = await admin
    .from('bom_templates')
    .update({ name: nextName, notes: nextNotes, is_active: nextActive })
    .eq('id', id)
  if (upErr) {
    // uq_bom_templates_filling / _warehouse: one name per kind+key scope.
    if (upErr.code === '23505') {
      return NextResponse.json(
        { error: 'Another template in this scope already uses that name' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // After the row update: a rejected rename must not leave the template rescoped.
  if (nextKeys) {
    const membership = await setTemplateKeys(admin, { templateId: id, kind, keys: nextKeys })
    if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 })
  }

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

  if (parsed.data.placements !== undefined) {
    if (tpl.role !== 'filling') {
      return NextResponse.json(
        { error: 'Placements are only allowed on Filling Templates (role=filling)' },
        { status: 400 },
      )
    }
    const rows = parsed.data.placements
    const cats = await lookupPlacementKinds(admin, rows.map((r) => r.item_id))
    if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 })

    const isBolster = tpl.kind === 'bolster'
    const valid = isBolster
      ? validateBolsterPlacements(rowsToBolsterPlacements(rows), cats.byId)
      : validatePillowPlacements(rowsToPillowPlacements(rows), cats.byId)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    // Placements are the "where" truth; legacy bom_template_lines stay untouched
    // as the pack-list fallback for templates without placements (ADR 0008).
    const table = isBolster ? 'bolster_template_placements' : 'filling_template_placements'
    const payload = rows.map((r) =>
      isBolster
        ? { template_id: id, slot: r.slot, item_id: r.item_id }
        : { template_id: id, section: r.section, sub_section: r.sub_section, slot: r.slot, item_id: r.item_id, row_index: r.row_index ?? null, insert_order: r.insert_order ?? null },
    )
    const { error: delErr } = await admin.from(table).delete().eq('template_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    if (payload.length) {
      const { error: insErr } = await admin.from(table).insert(payload)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, ...(nextKeys ? { keys: nextKeys } : {}) })
}
