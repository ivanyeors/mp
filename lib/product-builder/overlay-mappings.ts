import { supabaseAdmin } from "@/lib/supabase/server";
import type { OverlayFit, OverlayMappingItem } from "./overlays";

export type { OverlayMappingItem };

/** Slice 10: cover/case Item → overlay (Media Asset or color) mappings for Product Builder. */
export const OVERLAY_CATEGORIES = ["cover", "pillow_case", "bolster_case", "case"];

type MappingRow = {
  item_id: number;
  media_asset_id: string | null;
  color: string | null;
  fit: unknown;
  media_assets: { hosted_url: string | null } | { hosted_url: string | null }[] | null;
};

/**
 * Overlay-eligible items joined to their current mapping (with the asset's
 * hosted URL). Throws on a Supabase error so callers can map it to a status.
 */
export async function listOverlayMappingItems(): Promise<OverlayMappingItem[]> {
  const admin = supabaseAdmin();
  const [items, mappings] = await Promise.all([
    admin
      .from("items")
      .select("id, name, category, size")
      .eq("is_active", true)
      .in("category", OVERLAY_CATEGORIES)
      .order("category")
      .order("name"),
    admin
      .from("item_overlay_mappings")
      .select("item_id, media_asset_id, color, fit, media_assets ( hosted_url )"),
  ]);
  if (items.error) throw new Error(items.error.message);
  if (mappings.error) throw new Error(mappings.error.message);

  const byItem = new Map(
    ((mappings.data ?? []) as MappingRow[]).map((m) => {
      const asset = Array.isArray(m.media_assets) ? m.media_assets[0] : m.media_assets;
      return [
        m.item_id,
        {
          media_asset_id: m.media_asset_id,
          hosted_url: asset?.hosted_url ?? null,
          color: m.color ?? null,
          fit: (m.fit ?? null) as OverlayFit | null,
        },
      ];
    }),
  );

  return (items.data ?? []).map(
    (i: { id: number; name: string; category: string; size: string | null }) => ({
      ...i,
      mapping: byItem.get(i.id) ?? null,
    }),
  );
}
