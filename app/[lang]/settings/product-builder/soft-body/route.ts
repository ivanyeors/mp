import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAdminContext, requireAdmin } from '@/lib/auth/admin'
import { recordAdminAction } from '@/lib/auth/audit'
import { supabaseAdmin } from '@/lib/supabase/server'
import { invalidateTag } from '@/lib/cache/invalidate'
import {
  sameSoftBodySettings,
  SOFT_BODY_DEFAULTS,
  SOFT_BODY_RANGES,
  SOFT_BODY_SETTING_KEY,
  softBodySettings,
  softBodySettingsToStored,
  type SoftBodyPayload,
  type SoftBodySettings,
} from '@/lib/spatial-fillings/soft-body-settings'

export const runtime = 'nodejs'

type SettingRow = { value: string; updated_at: string | null }

const payloadFor = (row: SettingRow | null): SoftBodyPayload => ({
  settings: softBodySettings(row?.value ?? null),
  stored: row !== null,
  updatedAt: row?.updated_at ?? null,
  defaults: SOFT_BODY_DEFAULTS,
})

async function loadPayload(admin: SupabaseClient): Promise<SoftBodyPayload> {
  const { data, error } = await admin
    .from('site_settings')
    .select('value, updated_at')
    .eq('key', SOFT_BODY_SETTING_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return payloadFor((data as SettingRow | null) ?? null)
}

const snapshot = (p: SoftBodyPayload) => (p.stored ? p.settings : null)

const errorResponse = (err: unknown) =>
  NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })

export async function GET() {
  const denied = await requireAdmin('configure')
  if (denied) return denied
  try {
    return NextResponse.json(await loadPayload(supabaseAdmin()))
  } catch (err) {
    return errorResponse(err)
  }
}

const numbers = Object.fromEntries(
  Object.entries(SOFT_BODY_RANGES).map(([key, { min, max }]) => [key, z.number().min(min).max(max)]),
) as Record<keyof typeof SOFT_BODY_RANGES, z.ZodNumber>

const LATER_KEYS = { earFirmness: true, earWellPct: true, earWellDepthPct: true } as const
type LaterKey = keyof typeof LATER_KEYS

const SettingsSchema = z
  .object({
    enabled: z.boolean(),
    animate: z.boolean(),
    ...numbers,
  })
  .partial(LATER_KEYS) satisfies z.ZodType<Omit<SoftBodySettings, LaterKey> & Partial<Pick<SoftBodySettings, LaterKey>>>

const SaveSchema = z.object({ settings: SettingsSchema })

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = SaveSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  try {
    const before = await loadPayload(admin)
    const sent = Object.fromEntries(Object.entries(parsed.data.settings).filter(([, v]) => v !== undefined))
    const row = {
      key: SOFT_BODY_SETTING_KEY,
      value: softBodySettingsToStored({ ...before.settings, ...sent }),
      updated_at: new Date().toISOString(),
    }
    const { error } = await admin.from('site_settings').upsert(row, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    invalidateTag('site-settings')

    const after = payloadFor(row)
    if (!before.stored || !sameSoftBodySettings(before.settings, after.settings)) {
      await recordAdminAction({
        actor: await getAdminContext(),
        action: 'xray.soft_body_update',
        entityType: 'site_settings',
        entityId: SOFT_BODY_SETTING_KEY,
        before: snapshot(before),
        after: snapshot(after),
      })
    }
    return NextResponse.json(after)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE() {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const admin = supabaseAdmin()
  try {
    const before = await loadPayload(admin)
    const { error } = await admin.from('site_settings').delete().eq('key', SOFT_BODY_SETTING_KEY)
    if (error) throw new Error(error.message)
    invalidateTag('site-settings')

    if (before.stored) {
      await recordAdminAction({
        actor: await getAdminContext(),
        action: 'xray.soft_body_reset',
        entityType: 'site_settings',
        entityId: SOFT_BODY_SETTING_KEY,
        before: snapshot(before),
        after: null,
      })
    }
    return NextResponse.json(payloadFor(null))
  } catch (err) {
    return errorResponse(err)
  }
}
