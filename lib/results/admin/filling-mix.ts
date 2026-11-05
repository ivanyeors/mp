import type { SupabaseClient } from "@supabase/supabase-js";

import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { BolsterPlacementRow, PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { loadDimensionOverrides } from "@/lib/spatial-fillings/dimension-overrides.server";

/** A placed Item, so a saved mix still names a piece the editor's active list no longer carries. */
export type FillingMixItem = {
  id: number;
  name: string;
  subtype: string | null;
  size: string | null;
  category: string;
};

/**
 * What the Result detail page draws the Result's own Filling configuration
 * with: its saved snapshot, the Items it places, and the Product Builder
 * colours and Settings dimensions the x-ray reads. The two override tables are
 * service-role-only under RLS, so the page receives them from the server, as
 * Configure does from its template route — here without needing a template,
 * so a Result whose mix matches none still draws in the right colours.
 */
export type ResultFillingMixPayload = {
  productType: "pillow" | "bolster";
  placements: PillowPlacementRow[] | BolsterPlacementRow[];
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload;
};

export async function loadResultFillingMix(
  admin: SupabaseClient,
  resultId: string,
  productType: "pillow" | "bolster",
): Promise<{ ok: true; mix: ResultFillingMixPayload } | { ok: false; error: string }> {
  const placementsQuery =
    productType === "bolster"
      ? admin.from("result_bolster_filling_placements").select("slot, item_id").eq("result_id", resultId).order("slot")
      : admin
          .from("result_filling_placements")
          .select("section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm")
          .eq("result_id", resultId)
          .order("slot");

  const [placementsRes, colorsRes, dims] = await Promise.all([
    placementsQuery,
    admin.from("filling_color_overrides").select("subtype,color"),
    loadDimensionOverrides(admin).then(
      (payload) => ({ ok: true as const, payload }),
      (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "Couldn't load dimensions" }),
    ),
  ]);
  if (placementsRes.error) return { ok: false, error: placementsRes.error.message };
  if (colorsRes.error) return { ok: false, error: colorsRes.error.message };
  if (!dims.ok) return { ok: false, error: dims.error };

  const placements = (placementsRes.data ?? []) as unknown as PillowPlacementRow[] | BolsterPlacementRow[];
  const placedIds = [...new Set(placements.map((p) => Number(p.item_id)))];
  let items: FillingMixItem[] = [];
  if (placedIds.length) {
    const { data, error } = await admin.from("items").select("id, name, subtype, size, category").in("id", placedIds);
    if (error) return { ok: false, error: error.message };
    items = (data ?? []).map((i) => ({
      id: Number(i.id),
      name: String(i.name),
      subtype: (i.subtype as string | null) ?? null,
      size: (i.size as string | null) ?? null,
      category: String(i.category),
    }));
  }

  return {
    ok: true,
    mix: {
      productType,
      placements,
      items,
      colorOverrides: (colorsRes.data ?? []) as ColorOverrideRow[],
      dimensionOverrides: dims.payload,
    },
  };
}
