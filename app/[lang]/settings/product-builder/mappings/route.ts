import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { OverlayColorSchema, OverlayFitSchema } from '@/lib/product-builder/overlays'
import { listOverlayMappingItems } from '@/lib/product-builder/overlay-mappings'

export const runtime = 'nodejs'

export async function GET() {
  const denied = await requireAdmin('configure')
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

/**
 * One overlay applied to one or more Items — a whole family of sizes saves in a
 * single request. De-duplicated: an upsert touching the same row twice fails.
 */
const ItemIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(200)
  .transform((ids) => [...new Set(ids)])

const UpsertSchema = z.union([
  z.object({
    itemIds: ItemIdsSchema,
    assetId: z.string().uuid(),
    fit: OverlayFitSchema.nullish(),
  }),
  // A color fills the whole silhouette; there is nothing to place.
  z.object({ itemIds: ItemIdsSchema, color: OverlayColorSchema }),
])

export async function POST(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const overlay = parsed.data
  const rows = overlay.itemIds.map((itemId) =>
    'color' in overlay
      ? { item_id: itemId, media_asset_id: null, color: overlay.color, fit: null }
      : { item_id: itemId, media_asset_id: overlay.assetId, color: null, fit: overlay.fit ?? null },
  )

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('item_overlay_mappings')
    .upsert(rows, { onConflict: 'item_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const DeleteSchema = z.object({ itemIds: ItemIdsSchema })

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin('configure')
  if (denied) return denied

  const json = await req.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('item_overlay_mappings')
    .delete()
    .in('item_id', parsed.data.itemIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
