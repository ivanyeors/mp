import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { invalidateTag } from '@/lib/cache/invalidate'
import { pouchKey } from '@/lib/spatial-fillings/dimensions'
import {
  effectiveRegistry,
  LOFT_ALLOWANCE_MAX_PCT,
  LOFT_ALLOWANCE_SETTING_KEY,
  neckCatalog,
  pouchCatalog,
  type DimensionOverrideRow,
  type DimensionsPayload,
  type NeckSupportOverrideRow,
} from '@/lib/spatial-fillings/dimension-overrides'
import { PLACEABLE_ITEMS_OR } from '@/lib/spatial-fillings/filling-groups'

export const runtime = 'nodejs'

/**
 * X-ray pillow UX slice 12 (ADR 0019): Settings overrides for filling pouch
 * and Neck support dimensions plus the loft allowance. Pillow geometry
 * (outlines, Section widths, gusset heights) is the drawing and is never
 * accepted here — only the values that are business data are editable.
 * A row wins, no row = the code default in lib/spatial-fillings/dimensions.ts.
 */

const POUCH_COLUMNS =
  'key, width_mm, length_mm, thickness_mm, min_thickness_mm, min_width_mm, orientation, flat_length_mm, flat_width_mm, updated_at'
const NECK_COLUMNS = 'size, width_mm, length_mm, thickness_mm, min_thickness_mm, updated_at'

async function loadPayload(): Promise<DimensionsPayload> {
  const admin = supabaseAdmin()
  const [items, rows, neckRows, setting] = await Promise.all([
    admin.from('items').select('name, subtype, size, category').or(PLACEABLE_ITEMS_OR).eq('is_active', true),
    admin.from('filling_dimension_overrides').select(POUCH_COLUMNS),
    admin.from('neck_support_dimension_overrides').select(NECK_COLUMNS),
    admin.from('site_settings').select('value').eq('key', LOFT_ALLOWANCE_SETTING_KEY).maybeSingle(),
  ])
  for (const r of [items, rows, neckRows, setting]) {
    if (r.error) throw new Error(r.error.message)
  }
  const settingValue = (setting.data as { value: string } | null)?.value ?? null
  const registry = effectiveRegistry(
    (rows.data ?? []) as DimensionOverrideRow[],
    (neckRows.data ?? []) as NeckSupportOverrideRow[],
    settingValue,
  )
  const liveKeys = ((items.data ?? []) as { name: string; subtype: string | null; size: string | null; category: string | null }[]).map(
    (i) => pouchKey(i),
  )
  const storedPct = settingValue === null ? null : Number(settingValue)
  return {
    pouches: pouchCatalog(registry, liveKeys),
    neck: neckCatalog(registry),
    loftAllowancePct: storedPct !== null && Number.isFinite(storedPct) ? storedPct : null,
    loftAllowance: registry.loftAllowance,
  }
}

export async function GET() {
  const denied = await requireAdmin('configure')
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, ...(await loadPayload()) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

const mm = z.number().int().positive().max(2000)
const optionalMm = mm.nullable().optional()

const PouchSchema = z
  .object({
    kind: z.literal('pouch'),
    key: z.string().regex(/^[a-z0-9+]+\/[a-z0-9-]+(\/[a-z0-9-]+)?$/, 'Expected family/variant[/size], e.g. 6d/l'),
    width_mm: mm,
    length_mm: mm,
    thickness_mm: mm,
    min_thickness_mm: mm,
    min_width_mm: mm,
    flat_length_mm: optionalMm,
    flat_width_mm: optionalMm,
  })
  .refine((d) => d.min_thickness_mm <= d.thickness_mm, {
    message: 'Fully compressed thickness cannot exceed the relaxed thickness',
    path: ['min_thickness_mm'],
  })
  .refine((d) => d.min_width_mm <= d.width_mm, {
    message: 'Minimum width cannot exceed the width',
    path: ['min_width_mm'],
  })

const NeckSchema = z
  .object({
    kind: z.literal('neck'),
    size: z.enum(['XS', 'S', 'M', 'L']),
    length_mm: mm,
    radius_mm: mm,
    min_radius_mm: mm,
  })
  .refine((d) => d.min_radius_mm <= d.radius_mm, {
    message: 'Fully squashed radius cannot exceed the relaxed radius',
    path: ['min_radius_mm'],
  })

const AllowanceSchema = z.object({
  kind: z.literal('allowance'),
  pct: z.number().int().min(0).max(LOFT_ALLOWANCE_MAX_PCT),
})

const UpsertSchema = z.union([PouchSchema, NeckSchema, AllowanceSchema])

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const body = parsed.data
  let error: { message: string } | null = null
  if (body.kind === 'pouch') {
    const { kind: _kind, ...row } = body
    void _kind
    ;({ error } = await admin
      .from('filling_dimension_overrides')
      .upsert(
        { ...row, orientation: 'across', flat_length_mm: row.flat_length_mm ?? null, flat_width_mm: row.flat_width_mm ?? null },
        { onConflict: 'key' },
      ))
  } else if (body.kind === 'neck') {
    // The roll's footprint: width = its length, length and thickness = its diameter.
    const row = {
      size: body.size,
      width_mm: body.length_mm,
      length_mm: 2 * body.radius_mm,
      thickness_mm: 2 * body.radius_mm,
      min_thickness_mm: 2 * body.min_radius_mm,
    }
    ;({ error } = await admin.from('neck_support_dimension_overrides').upsert(row, { onConflict: 'size' }))
  } else {
    ;({ error } = await admin
      .from('site_settings')
      .upsert(
        { key: LOFT_ALLOWANCE_SETTING_KEY, value: String(body.pct), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      ))
    if (!error) invalidateTag('site-settings')
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const DeleteSchema = z.union([
  z.object({ kind: z.literal('pouch'), key: z.string().min(1) }),
  z.object({ kind: z.literal('neck'), size: z.enum(['XS', 'S', 'M', 'L']) }),
  z.object({ kind: z.literal('allowance') }),
])

/** Reset one entry to its code default by deleting its row. */
export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const body = parsed.data
  let error: { message: string } | null = null
  if (body.kind === 'pouch') {
    ;({ error } = await admin.from('filling_dimension_overrides').delete().eq('key', body.key))
  } else if (body.kind === 'neck') {
    ;({ error } = await admin.from('neck_support_dimension_overrides').delete().eq('size', body.size))
  } else {
    ;({ error } = await admin.from('site_settings').delete().eq('key', LOFT_ALLOWANCE_SETTING_KEY))
    if (!error) invalidateTag('site-settings')
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
