import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { OverlayFitSchema } from '@/lib/product-builder/overlays'
import { listOverlayMappingItems } from '@/lib/product-builder/overlay-mappings'

export const runtime = 'nodejs'

export async function GET() {
  const denied = await requireAdmin('products')
  if (denied) return denied

  try {
    return NextResponse.json({ ok: true, items: await listOverlayMappingItems() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

const UpsertSchema = z.object({
  itemId: z.number().int().positive(),
  assetId: z.string().uuid(),
  fit: OverlayFitSchema.nullish(),
})

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('products')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('item_overlay_mappings')
    .upsert(
      {
        item_id: parsed.data.itemId,
        media_asset_id: parsed.data.assetId,
        fit: parsed.data.fit ?? null,
      },
      { onConflict: 'item_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const DeleteSchema = z.object({ itemId: z.number().int().positive() })

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin('products')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('item_overlay_mappings')
    .delete()
    .eq('item_id', parsed.data.itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
