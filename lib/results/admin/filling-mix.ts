import type { SupabaseClient } from "@supabase/supabase-js";

import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { BolsterPlacementRow, PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { loadDimensionOverrides } from "@/lib/spatial-fillings/dimension-overrides.server";

export type FillingMixItem = {
  id: number;
  name: string;
  subtype: string | null;
  size: string | null;
  category: string;
};

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

  const [placementsRes, overrides] = await Promise.all([placementsQuery, loadXrayOverrides(admin)]);
  if (placementsRes.error) return { ok: false, error: placementsRes.error.message };
  if (!overrides.ok) return overrides;

  const placements = (placementsRes.data ?? []) as unknown as PillowPlacementRow[] | BolsterPlacementRow[];
  const items = await loadPlacedItems(admin, placements);
  if (!items.ok) return items;

  return {
    ok: true,
    mix: {
      productType,
      placements,
      items: items.items,
      colorOverrides: overrides.colorOverrides,
      dimensionOverrides: overrides.dimensionOverrides,
    },
  };
}

export async function loadXrayOverrides(
  admin: SupabaseClient,
): Promise<
  | { ok: true; colorOverrides: ColorOverrideRow[]; dimensionOverrides: DimensionOverridesPayload }
  | { ok: false; error: string }
> {
  const [colorsRes, dims] = await Promise.all([
    admin.from("filling_color_overrides").select("subtype,color"),
    loadDimensionOverrides(admin).then(
      (payload) => ({ ok: true as const, payload }),
      (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "Couldn't load dimensions" }),
    ),
  ]);
  if (colorsRes.error) return { ok: false, error: colorsRes.error.message };
  if (!dims.ok) return { ok: false, error: dims.error };
  return { ok: true, colorOverrides: (colorsRes.data ?? []) as ColorOverrideRow[], dimensionOverrides: dims.payload };
}

export async function loadPlacedItems(
  admin: SupabaseClient,
  placements: ReadonlyArray<{ item_id: number | string }>,
): Promise<{ ok: true; items: FillingMixItem[] } | { ok: false; error: string }> {
  const placedIds = [...new Set(placements.map((p) => Number(p.item_id)))];
  if (!placedIds.length) return { ok: true, items: [] };
  const { data, error } = await admin.from("items").select("id, name, subtype, size, category").in("id", placedIds);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    items: (data ?? []).map((i) => ({
      id: Number(i.id),
      name: String(i.name),
      subtype: (i.subtype as string | null) ?? null,
      size: (i.size as string | null) ?? null,
      category: String(i.category),
    })),
  };
}
