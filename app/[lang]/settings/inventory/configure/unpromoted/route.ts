import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import {
  rankUnpromoted,
  verifyPromotedMix,
  type UnpromotedSnapshot,
} from '@/lib/filling-templates/unpromoted'
import {
  derivePackList,
  fingerprintPlacements,
  rowsToPillowPlacements,
  type PillowPlacementRow,
} from '@/lib/spatial-fillings'

export const runtime = 'nodejs'

// Bolster ranking is slice 13 — pillow only here. Scope = template scope (kind, key=size).
const ScopeSchema = z.object({ kind: z.literal('pillow'), key: z.string().min(1).max(40) })

const PromoteSchema = ScopeSchema.extend({
  fingerprint: z.string().min(1),
  name: z.string().trim().min(1).max(120),
})

type Admin = ReturnType<typeof supabaseAdmin>

/** Fingerprints of ALL filling templates in scope (active and inactive). */
async function loadTemplateFingerprints(admin: Admin, kind: string, key: string): Promise<string[]> {
  const { data: templates, error } = await admin
    .from('bom_templates')
    .select('id')
    .eq('role', 'filling')
    .eq('kind', kind)
    .eq('key', key)
  if (error) throw new Error(error.message)
  const ids = (templates ?? []).map((t) => t.id as number)
  if (!ids.length) return []
  const { data: rows, error: pErr } = await admin
    .from('filling_template_placements')
    .select('template_id, section, sub_section, slot, item_id')
    .in('template_id', ids)
  if (pErr) throw new Error(pErr.message)
  const byTemplate = new Map<number, PillowPlacementRow[]>()
  for (const r of (rows ?? []) as Array<PillowPlacementRow & { template_id: number }>) {
    byTemplate.set(r.template_id, [...(byTemplate.get(r.template_id) ?? []), r])
  }
  return Array.from(byTemplate.values()).map((r) => fingerprintPlacements(rowsToPillowPlacements(r)))
}

type ResultScopeRow = {
  id: string
  filling_fingerprint: string
  assigned_size: string | null
  suggested_size: string | null
}

/** Result → product-card size key: assigned size wins over suggested. */
const resultScopeKey = (r: ResultScopeRow) => r.assigned_size ?? r.suggested_size

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

  // ponytail: full scan of fingerprinted pillow Results; paginate if volume demands.
  const { data: results, error: rErr } = await admin
    .from('mp_config_responses')
    .select('id, filling_fingerprint, assigned_size, suggested_size')
    .eq('product_type', 'pillow')
    .not('filling_fingerprint', 'is', null)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const snapshots: UnpromotedSnapshot[] = ((results ?? []) as ResultScopeRow[]).map((r) => ({
    resultId: r.id,
    fingerprint: r.filling_fingerprint,
    scopeKey: resultScopeKey(r),
  }))
  const ranked = rankUnpromoted({ snapshots, templateFingerprints, scope: { key } })

  const repIds = ranked.map((r) => r.representativeResultId)
  const rowsByResult = new Map<string, PillowPlacementRow[]>()
  if (repIds.length) {
    const { data: pl, error: pErr } = await admin
      .from('result_filling_placements')
      .select('result_id, section, sub_section, slot, item_id')
      .in('result_id', repIds)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    for (const r of (pl ?? []) as Array<PillowPlacementRow & { result_id: string }>) {
      const { result_id, section, sub_section, slot, item_id } = r
      rowsByResult.set(result_id, [
        ...(rowsByResult.get(result_id) ?? []),
        { section, sub_section, slot, item_id },
      ])
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
    .select('id, filling_fingerprint, assigned_size, suggested_size')
    .eq('product_type', 'pillow')
    .eq('filling_fingerprint', fingerprint)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  const rep = ((results ?? []) as ResultScopeRow[]).find((r) => resultScopeKey(r) === key)
  if (!rep) {
    return NextResponse.json({ error: 'Mix no longer exists on any Result in this scope' }, { status: 409 })
  }

  const { data: pl, error: pErr } = await admin
    .from('result_filling_placements')
    .select('section, sub_section, slot, item_id')
    .eq('result_id', rep.id)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const rows = (pl ?? []) as PillowPlacementRow[]
  const verified = verifyPromotedMix(rows, fingerprint)
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 409 })

  // Named active catalog Filling Template — size-scoped, so no pillow_kind/variant (ADR 0008).
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

  const payload = rows.map((r) => ({
    template_id: created.id,
    section: r.section,
    sub_section: r.sub_section,
    slot: r.slot,
    item_id: r.item_id,
  }))
  const { error: plErr } = await admin.from('filling_template_placements').insert(payload)
  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, template: created })
}
