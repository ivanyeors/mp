import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { lookupPlacementKinds } from '@/lib/bom-sanitizer'
import {
  MAX_LAYERS_PER_CELL,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
} from '@/lib/spatial-fillings'
import { templateKeyLabel } from '@/lib/filling-templates/keys'
import {
  assertTemplateNameFree,
  loadTemplateKeys,
  setTemplateKeys,
} from '@/lib/filling-templates/membership'

export const runtime = 'nodejs'

/**
 * Diverge one size from a shared Filling Template.
 *
 * Sharing a recipe across sizes is only safe if an operator can take one size
 * back out again. This copies the recipe (placements and legacy flat lines) to
 * a new template scoped to `key` alone, and drops `key` from the original — so
 * the size that needed to differ stops tracking the shared one, and every other
 * size it served is untouched.
 */
const PlacementRowSchema = z.object({
  section: z.string().default(''),
  sub_section: z.string().default(''),
  slot: z.number().int(),
  item_id: z.number().int().positive(),
  row_index: z.number().int().min(0).max(MAX_LAYERS_PER_CELL - 1).nullable().optional(),
  insert_order: z.number().int().min(1).nullable().optional(),
})

const ForkSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  /**
   * The recipe to give the copy. The operator forks precisely because they are
   * mid-edit and do not want the save to reach the other sizes, so the copy
   * must take what is on their screen — copying the stored rows instead would
   * silently discard the edits that prompted the fork. Omitted = copy stored.
   */
  placements: z.array(PlacementRowSchema).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const json = await req.json().catch(() => null)
  const parsed = ForkSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { key, name } = parsed.data

  const admin = supabaseAdmin()
  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,name,notes,role,is_active')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (tpl.role !== 'filling') {
    return NextResponse.json({ error: 'Only Filling Templates can be forked per size' }, { status: 400 })
  }
  const kind = tpl.kind === 'bolster' ? 'bolster' : 'pillow'

  const loaded = await loadTemplateKeys(admin, [id])
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  const currentKeys = loaded.byId.get(id) ?? [tpl.key]
  if (!currentKeys.includes(key)) {
    return NextResponse.json(
      { error: `This template does not apply to ${templateKeyLabel(kind, key)}` },
      { status: 400 },
    )
  }
  if (currentKeys.length === 1) {
    return NextResponse.json(
      { error: 'This template already applies to one size only — edit it directly' },
      { status: 400 },
    )
  }

  const free = await assertTemplateNameFree(admin, { kind, keys: [key], name })
  if (!free.ok) return NextResponse.json({ error: free.error }, { status: 409 })

  const { data: created, error: insErr } = await admin
    .from('bom_templates')
    .insert({
      kind: tpl.kind,
      key,
      // Filling Templates carry no tier or variant (ADR 0003).
      pillow_kind: null,
      pillow_variant: null,
      name,
      notes: tpl.notes ?? null,
      role: 'filling',
      is_active: tpl.is_active,
    })
    .select('id,kind,key,name,notes,role,is_active')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const membership = await setTemplateKeys(admin, { templateId: created.id, kind, keys: [key] })
  if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 })

  // Placements are the recipe (ADR 0008); the legacy flat lines ride along so a
  // pre-spatial template forks into something with the same derived pack list.
  const placementTable = kind === 'bolster' ? 'bolster_template_placements' : 'filling_template_placements'
  const placementCols =
    kind === 'bolster' ? 'slot,item_id' : 'section,sub_section,slot,item_id,row_index,insert_order'

  let sourceRows: Array<Record<string, unknown>>
  if (parsed.data.placements) {
    const rows = parsed.data.placements
    const cats = await lookupPlacementKinds(admin, rows.map((r) => r.item_id))
    if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 })
    const valid =
      kind === 'bolster'
        ? validateBolsterPlacements(rowsToBolsterPlacements(rows), cats.byId)
        : validatePillowPlacements(rowsToPillowPlacements(rows), cats.byId)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })
    sourceRows = rows.map((r) =>
      kind === 'bolster'
        ? { slot: r.slot, item_id: r.item_id }
        : {
            section: r.section,
            sub_section: r.sub_section,
            slot: r.slot,
            item_id: r.item_id,
            row_index: r.row_index ?? null,
            insert_order: r.insert_order ?? null,
          },
    )
  } else {
    const { data: placements, error: pErr } = await admin
      .from(placementTable)
      .select(placementCols)
      .eq('template_id', id)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    sourceRows = (placements ?? []) as unknown as Array<Record<string, unknown>>
  }

  if (sourceRows.length) {
    const rows = sourceRows.map((row) => ({ ...row, template_id: created.id }))
    const { error: copyErr } = await admin.from(placementTable).insert(rows)
    if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 500 })
  }

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', id)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  if ((lines ?? []).length) {
    const rows = (lines ?? []).map((l: { item_id: number; quantity: number }) => ({
      template_id: created.id,
      item_id: l.item_id,
      quantity: l.quantity,
    }))
    const { error: copyErr } = await admin.from('bom_template_lines').insert(rows)
    if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 500 })
  }

  // Only now does the original stop serving this size: if any copy step above
  // failed, the operator still has the shared template they started with.
  const remaining = currentKeys.filter((k) => k !== key)
  const rescoped = await setTemplateKeys(admin, { templateId: id, kind, keys: remaining })
  if (!rescoped.ok) return NextResponse.json({ error: rescoped.error }, { status: 400 })

  return NextResponse.json({ ok: true, template: created, keys: membership.keys, sourceKeys: rescoped.keys })
}
