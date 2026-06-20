import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CustomerPreferences,
  MeasurementBasedPreferences,
  BolsterPreferences,
  CustomizationResult,
} from "@/lib/types/customization";
import { recommendWithFallback } from "@/lib/shop/recommendation/engine";
import {
  recommendFromPreferences,
  recommendFromMeasurements,
  recommendBolster,
} from "@/lib/shop/recommendation/rules";

interface FillingItem {
  item_id: number;
  subtype: string;
  name: string;
  on_hand: number;
}

interface BomTemplate {
  id: number;
  name: string;
  kind: string;
  key: string;
  pillow_kind: string | null;
  lines: { item_id: number; subtype: string; quantity: number }[];
}

/**
 * Get available filling items with current stock levels.
 */
export async function getAvailableFillings(): Promise<FillingItem[]> {
  const admin = supabaseAdmin();
  const { data: items } = await admin
    .from("items")
    .select("id, subtype, name")
    .eq("category", "filling")
    .eq("is_active", true);

  if (!items || items.length === 0) return [];

  // Get stock levels
  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", items.map((i: { id: number }) => i.id));

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  return items.map((i: { id: number; subtype: string; name: string }) => ({
    item_id: i.id,
    subtype: i.subtype ?? "",
    name: i.name,
    on_hand: stockMap.get(i.id) ?? 0,
  }));
}

/**
 * Get BOM templates for a given pillow kind and size.
 */
export async function getBomTemplates(kind: string, size: string): Promise<BomTemplate[]> {
  const admin = supabaseAdmin();
  const { data: templates } = await admin
    .from("bom_templates")
    .select("id, name, kind, key, pillow_kind, bom_template_lines(item_id, quantity)")
    .eq("kind", "pillow")
    .eq("key", size)
    .eq("pillow_kind", kind);

  if (!templates) return [];

  // Enrich with subtype info
  const allItemIds = templates.flatMap((t: { bom_template_lines: { item_id: number }[] }) =>
    t.bom_template_lines.map((l) => l.item_id)
  );

  const { data: items } = await admin
    .from("items")
    .select("id, subtype")
    .in("id", allItemIds);

  const subtypeMap = new Map<number, string>(
    (items ?? []).map((i: { id: number; subtype: string }) => [i.id, i.subtype ?? ""])
  );

  return templates.map((t: {
    id: number;
    name: string;
    kind: string;
    key: string;
    pillow_kind: string | null;
    bom_template_lines: { item_id: number; quantity: number }[];
  }) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    key: t.key,
    pillow_kind: t.pillow_kind,
    lines: t.bom_template_lines.map((l) => ({
      item_id: l.item_id,
      subtype: subtypeMap.get(l.item_id) ?? "",
      quantity: l.quantity,
    })),
  }));
}

// ─── Recommendation Entry Points ───────────────────────────
//
// Each entry point delegates to the recommendation engine, which first tries
// the optional configured model endpoint and otherwise returns the guaranteed
// rule-based recommendation (see lib/shop/recommendation/*).

/**
 * Simple-form recommendation (sleep position + body type + firmness).
 */
export async function getFillingRecommendation(
  preferences: CustomerPreferences,
): Promise<CustomizationResult> {
  return recommendWithFallback({ preferences }, async () => {
    const availableFillings = await getAvailableFillings();
    return recommendFromPreferences(preferences, availableFillings);
  });
}

/**
 * Measurement-based recommendation (in-store wizard data + health profile).
 */
export async function getRecommendationFromMeasurements(
  input: MeasurementBasedPreferences,
): Promise<CustomizationResult> {
  return recommendWithFallback({ measurement_preferences: input }, async () => {
    const availableFillings = await getAvailableFillings();
    return recommendFromMeasurements(input, availableFillings);
  });
}

/**
 * Bolster recommendation (height + sleep position).
 */
export async function getBolsterRecommendation(
  input: BolsterPreferences,
): Promise<CustomizationResult> {
  return recommendWithFallback({ bolster_preferences: input }, () => recommendBolster(input));
}
