import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await ctx.params
  const id = Number(templateId)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: tpl, error: tErr } = await admin
    .from('bom_templates')
    .select('id,kind,key,pillow_kind,pillow_variant,name,notes,created_at,updated_at')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { data: lines, error: lErr } = await admin
    .from('bom_template_lines')
    .select('item_id,quantity')
    .eq('template_id', id)
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, template: tpl, lines: lines ?? [] })
}


