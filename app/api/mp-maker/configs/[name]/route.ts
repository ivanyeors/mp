import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { name: string } }) {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('mp_maker_configs')
    .select('id,name,data,created_at,updated_at')
    .eq('name', decodeURIComponent(params.name))
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ config: data })
}
