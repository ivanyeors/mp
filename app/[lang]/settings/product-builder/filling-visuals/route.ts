import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Slice 11: filling subtype → color override for the x-ray CSS-variable
 * pipeline (ADR 0009 guardrail 5). Shape is a code concern and is never
 * accepted here — only color is editable.
 */

export async function GET() {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const admin = supabaseAdmin()
  const [items, overrides] = await Promise.all([
    admin
      .from('items')
      .select('subtype')
      .eq('category', 'filling')
      .eq('is_active', true)
      .not('subtype', 'is', null),
    admin.from('filling_color_overrides').select('subtype, color'),
  ])
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 })
  if (overrides.error) return NextResponse.json({ error: overrides.error.message }, { status: 500 })

  const subtypes = [...new Set((items.data ?? []).map((i) => i.subtype as string))].sort()
  return NextResponse.json({ ok: true, subtypes, overrides: overrides.data ?? [] })
}

const UpsertSchema = z.object({
  subtype: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb'),
})

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('filling_color_overrides')
    .upsert({ subtype: parsed.data.subtype, color: parsed.data.color }, { onConflict: 'subtype' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const DeleteSchema = z.object({ subtype: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('filling_color_overrides')
    .delete()
    .eq('subtype', parsed.data.subtype)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
