import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calibrationSheet, type CalibrationTemplate } from "@/lib/spatial-fillings/calibration";
import { rowsToPillowPlacements, type PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { isPillowSize } from "@/lib/spatial-fillings/dimensions";
import { registryFromPayload, resolveItemDims } from "@/lib/spatial-fillings/dimension-overrides";
import { loadDimensionOverrides } from "@/lib/spatial-fillings/dimension-overrides.server";

import { CalibrationSheetView } from "./calibration-sheet-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Sizes slice 10 builds from their default templates. */
const BUILD_SIZES = ["S", "M", "L"];

/**
 * Calibration sheet (X-ray pillow UX slice 10): the x-ray's predictions for
 * every bench check, read fresh from Settings on each load, so it can be
 * printed before the measurements are in and again after. Same permission as
 * the Products › Dimensions tab, which it checks.
 */
export default async function CalibrationPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("products", locale);

  const admin = supabaseAdmin();
  const [overrides, products] = await Promise.all([
    loadDimensionOverrides(admin),
    admin
      .from("pillow_products")
      .select("size, kind, default_filling_template_id")
      .eq("is_active", true)
      .in("size", BUILD_SIZES)
      .not("default_filling_template_id", "is", null),
  ]);
  if (products.error) throw new Error(products.error.message);
  const registry = registryFromPayload(overrides);

  const cards = (products.data ?? []) as { size: string; kind: string; default_filling_template_id: number }[];
  const ids = [...new Set(cards.map((c) => Number(c.default_filling_template_id)))];
  const [names, rows] = ids.length
    ? await Promise.all([
        admin.from("bom_templates").select("id, name").in("id", ids),
        admin
          .from("filling_template_placements")
          .select("template_id, section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm")
          .in("template_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  for (const r of [names, rows]) if (r.error) throw new Error(r.error.message);
  const placementRows = (rows.data ?? []) as (PillowPlacementRow & { template_id: number })[];
  const itemIds = [...new Set(placementRows.map((r) => r.item_id))];
  const items = itemIds.length
    ? await admin.from("items").select("id, name, subtype, size, category").in("id", itemIds)
    : { data: [], error: null };
  if (items.error) throw new Error(items.error.message);
  const dims = resolveItemDims((items.data ?? []) as { id: number; name: string; subtype: string | null; size: string | null }[], registry);
  const nameOf = new Map(((names.data ?? []) as { id: number; name: string }[]).map((t) => [t.id, t.name]));

  const templates: CalibrationTemplate[] = cards
    .filter((c) => isPillowSize(c.size))
    .sort((a, b) => BUILD_SIZES.indexOf(a.size) - BUILD_SIZES.indexOf(b.size) || a.kind.localeCompare(b.kind))
    .map((c) => {
      const id = Number(c.default_filling_template_id);
      return {
        size: c.size as CalibrationTemplate["size"],
        tier: c.kind,
        name: nameOf.get(id) ?? `Template #${id}`,
        placements: rowsToPillowPlacements(placementRows.filter((r) => Number(r.template_id) === id)),
        dims,
      };
    });

  const generatedAt = new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" });
  return <CalibrationSheetView sheet={calibrationSheet(registry, templates)} generatedAt={generatedAt} />;
}
