import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { setTemplateKeys, templateIdsForKey } from '@/lib/filling-templates/membership'
import {
  rankUnpromoted,
  verifyPromotedBolsterMix,
  verifyPromotedMix,
  type UnpromotedSnapshot,
} from '@/lib/filling-templates/unpromoted'
import {
  derivePackList,
  fingerprintPlacements,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type BolsterPlacementRow,
  type PillowPlacementRow,
} from '@/lib/spatial-fillings'

export const runtime = 'nodejs'

// Scope = template scope: (kind=pillow, key=size) or (kind=bolster, key=length).
const ScopeSchema = z.object({ kind: z.enum(['pillow', 'bolster']), key: z.string().min(1).max(40) })

const PromoteSchema = ScopeSchema.extend({
  fingerprint: z.string().min(1),
  name: z.string().trim().min(1).max(120),
})

type Admin = ReturnType<typeof supabaseAdmin>
type Kind = 'pillow' | 'bolster'

// Bolster placements use their own schema/tables — never the pillow enums (ADR 0008).
const TPL_TABLE: Record<Kind, string> = {
  pillow: 'filling_template_placements',
  bolster: 'bolster_template_placements',
}
const RESULT_TABLE: Record<Kind, string> = {
  pillow: 'result_filling_placements',
  bolster: 'result_bolster_filling_placements',
}
// row_index (and insert_order) ride along because Promote INSERTs these rows verbatim into
// filling_template_placements below: without it, promoting a stacked mix
// silently flattens every cell to side-by-side in the new catalog template.
// Harmless on the two fingerprint reads — canonicalizePlacements drops `row`.
const ROW_COLS: Record<Kind, string> = {
  pillow: 'section, sub_section, slot, item_id, row_index, insert_order',
  bolster: 'slot, item_id',
}

type AnyRow = PillowPlacementRow | BolsterPlacementRow

const toPlacements = (kind: Kind, rows: AnyRow[]) =>
  kind === 'bolster'
    ? rowsToBolsterPlacements(rows as BolsterPlacementRow[])
    : rowsToPillowPlacements(rows as PillowPlacementRow[])

/** Fingerprints of ALL filling templates in scope (active and inactive). */
async function loadTemplateFingerprints(admin: Admin, kind: Kind, key: string): Promise<string[]> {
  // Membership, not `key`: a mix already promoted at another size and shared in
  // here is promoted, and must not be ranked as unpromoted a second time.
  const members = await templateIdsForKey(admin, key)
  if (!members.ok) throw new Error(members.error)
  if (!members.ids.length) return []
  const { data: templates, error } = await admin
    .from('bom_templates')
    .select('id')
    .eq('role', 'filling')
    .eq('kind', kind)
    .in('id', members.ids)
  if (error) throw new Error(error.message)
  const ids = (templates ?? []).map((t) => t.id as number)
  if (!ids.length) return []
  const { data: rows, error: pErr } = await admin
    .from(TPL_TABLE[kind])
    .select(`template_id, ${ROW_COLS[kind]}`)
    .in('template_id', ids)
  if (pErr) throw new Error(pErr.message)
  const byTemplate = new Map<number, AnyRow[]>()
  for (const r of (rows ?? []) as unknown as Array<AnyRow & { template_id: number }>) {
    byTemplate.set(r.template_id, [...(byTemplate.get(r.template_id) ?? []), r])
  }
  return Array.from(byTemplate.values()).map((r) => fingerprintPlacements(toPlacements(kind, r)))
}

type ResultScopeRow = {
  id: string
  filling_fingerprint: string
  assigned_size: string | null
  suggested_size: string | null
  assigned_length: string | null
  suggested_length: string | null
}

/** Result → product-card scope key: assigned wins over suggested (size or length). */
const resultScopeKey = (kind: Kind, r: ResultScopeRow) =>
  kind === 'bolster' ? (r.assigned_length ?? r.suggested_length) : (r.assigned_size ?? r.suggested_size)

const RESULT_SCOPE_COLS =
  'id, filling_fingerprint, assigned_size, suggested_size, assigned_length, suggested_length'

export async function GET(req: NextRequest) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const parsed = ScopeSchema.safeParse({ kind: searchParams.get('kind'), key: searchParams.get('key') })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { kind, key } = parsed.data

  const admin = supabaseAdmin()
  let templateFingerprints: string[]
  try {
    templateFingerprints = await loadTemplateFingerprints(admin, kind, key)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }

  // ponytail: full scan of fingerprinted Results for the kind; paginate if volume demands.
  const { data: results, error: rErr } = await admin
    .from('mp_config_responses')
    .select(RESULT_SCOPE_COLS)
    .eq('product_type', kind)
    .not('filling_fingerprint', 'is', null)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const snapshots: UnpromotedSnapshot[] = ((results ?? []) as ResultScopeRow[]).map((r) => ({
    resultId: r.id,
    fingerprint: r.filling_fingerprint,
    scopeKey: resultScopeKey(kind, r),
  }))
  const ranked = rankUnpromoted({ snapshots, templateFingerprints, scope: { key } })

  const repIds = ranked.map((r) => r.representativeResultId)
  const rowsByResult = new Map<string, AnyRow[]>()
  if (repIds.length) {
    const { data: pl, error: pErr } = await admin
      .from(RESULT_TABLE[kind])
      .select(`result_id, ${ROW_COLS[kind]}`)
      .in('result_id', repIds)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    for (const r of (pl ?? []) as unknown as Array<AnyRow & { result_id: string }>) {
      const { result_id, ...row } = r
      rowsByResult.set(result_id, [...(rowsByResult.get(result_id) ?? []), row as AnyRow])
    }
  }

  const entries = ranked.map((r) => {
    const placements = rowsByResult.get(r.representativeResultId) ?? []
    return {
      fingerprint: r.fingerprint,
      count: r.count,
      placements,
      packList: derivePackList(placements, []),
    }
  })
  return NextResponse.json({ ok: true, entries })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('inventory')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = PromoteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { kind, key, fingerprint, name } = parsed.data

  const admin = supabaseAdmin()

  // A representative in-scope Result still carrying this fingerprint.
  const { data: results, error: rErr } = await admin
    .from('mp_config_responses')
    .select(RESULT_SCOPE_COLS)
    .eq('product_type', kind)
    .eq('filling_fingerprint', fingerprint)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  const rep = ((results ?? []) as ResultScopeRow[]).find((r) => resultScopeKey(kind, r) === key)
  if (!rep) {
    return NextResponse.json({ error: 'Mix no longer exists on any Result in this scope' }, { status: 409 })
  }

  const { data: pl, error: pErr } = await admin
    .from(RESULT_TABLE[kind])
    .select(ROW_COLS[kind])
    .eq('result_id', rep.id)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const rows = (pl ?? []) as unknown as AnyRow[]
  const verified =
    kind === 'bolster'
      ? verifyPromotedBolsterMix(rows as BolsterPlacementRow[], fingerprint)
      : verifyPromotedMix(rows as PillowPlacementRow[], fingerprint)
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 409 })

  // Named active catalog Filling Template — scope-keyed, so no pillow_kind/variant (ADR 0008).
  const { data: created, error: insErr } = await admin
    .from('bom_templates')
    .insert({
      kind,
      key,
      pillow_kind: null,
      pillow_variant: null,
      name,
      notes: null,
      role: 'filling',
      is_active: true,
    })
    .select('id,kind,key,name,role,is_active')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })

  // A promoted mix serves the size it was used at; widening is a Configure act.
  const membership = await setTemplateKeys(admin, { templateId: created.id, kind, keys: [key] })
  if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 })

  const payload = rows.map((r) => ({ template_id: created.id, ...r }))
  const { error: plErr } = await admin.from(TPL_TABLE[kind]).insert(payload)
  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, template: created })
}
