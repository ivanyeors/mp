import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { OverlayFitSchema } from '@/lib/product-builder/overlays'

export const runtime = 'nodejs'

/** Slice 10: cover/case Item → overlay Media Asset mappings for Product Builder. */
const OVERLAY_CATEGORIES = ['cover', 'pillow_case', 'bolster_case', 'case']

type MappingRow = {
  item_id: number
  media_asset_id: string
  fit: unknown
  media_assets: { hosted_url: string | null } | { hosted_url: string | null }[] | null
}

export async function GET() {
  const admin = supabaseAdmin()
  const [items, mappings] = await Promise.all([
    admin
      .from('items')
      .select('id, name, category, size')
      .eq('is_active', true)
      .in('category', OVERLAY_CATEGORIES)
      .order('category')
      .order('name'),
    admin
      .from('item_overlay_mappings')
      .select('item_id, media_asset_id, fit, media_assets ( hosted_url )'),
  ])
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 })
  if (mappings.error) return NextResponse.json({ error: mappings.error.message }, { status: 500 })

  const byItem = new Map(
    ((mappings.data ?? []) as MappingRow[]).map((m) => {
      const asset = Array.isArray(m.media_assets) ? m.media_assets[0] : m.media_assets
      return [
        m.item_id,
        {
          media_asset_id: m.media_asset_id,
          hosted_url: asset?.hosted_url ?? null,
          fit: m.fit ?? null,
        },
      ]
    }),
  )

  return NextResponse.json({
    ok: true,
    items: (items.data ?? []).map((i: { id: number; name: string; category: string; size: string | null }) => ({
      ...i,
      mapping: byItem.get(i.id) ?? null,
    })),
  })
}

const UpsertSchema = z.object({
  itemId: z.number().int().positive(),
  assetId: z.string().uuid(),
  fit: OverlayFitSchema.nullish(),
})

export async function POST(req: NextRequest) {
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
