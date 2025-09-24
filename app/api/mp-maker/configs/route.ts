import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'

const SaveSchema = z.object({
  name: z.string().min(1).max(120),
  data: z.object({
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      src: z.string(),
      x: z.number(),
      y: z.number(),
      z: z.number(),
      r: z.number(),
      s: z.number(),
    })),
    groupRotation: z.number(),
  }),
})

export async function GET() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('mp_maker_configs')
    .select('id,name,created_at,updated_at')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = SaveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, data } = parsed.data
  const admin = supabaseAdmin()
  const { error } = await admin
    .from('mp_maker_configs')
    .upsert({ name, data }, { onConflict: 'name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
