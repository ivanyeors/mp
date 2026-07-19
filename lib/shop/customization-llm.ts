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
  recommendSizeFromPreferences,
} from "@/lib/shop/recommendation/rules";
import {
  inputsFromBolsterHeight,
  inputsFromMeasurementPrefs,
  lengthToBolsterLetter,
  recommendWithEngine,
  type RecommendationRecord,
} from "@/lib/rules-engine";

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

/** Size ballpark only — rule-based, no fillings (online purchase path, slice 12). */
export function getSizeBallparkFromPreferences(
  preferences: CustomerPreferences,
): CustomizationResult {
  // Preferences-only shape has no measurement graph; keep SIZE_MAP (mp-maker / legacy).
  return recommendSizeFromPreferences(preferences);
}

function ballparkFromRecord(
  record: RecommendationRecord,
  explanation: string,
): CustomizationResult & { recommendation_record: RecommendationRecord } {
  const size =
    record.flow === "mbolster" && record.size
      ? lengthToBolsterLetter(record.size)
      : String(record.size ?? "M");
  const kind = record.soldTier ?? record.tierSuggestion ?? "basic";
  return {
    recommended_size: size,
    recommended_kind: kind,
    filling_lines: [],
    summary: record.flow === "mbolster" ? `Mbolster ${record.size}` : `Size ${size} — ${kind}`,
    explanation,
    graph_version_id: record.graphVersionId,
    recommendation_record: record,
  };
}

/** Measurement size ballpark — Premium Rules Engine (sold tier premium). */
export async function getSizeBallparkFromMeasurements(
  input: MeasurementBasedPreferences,
): Promise<CustomizationResult & { recommendation_record: RecommendationRecord }> {
  const result = await recommendWithEngine(
    "premium-mpillow",
    inputsFromMeasurementPrefs(input),
  );
  if ("error" in result) {
    throw new Error(result.error);
  }
  return ballparkFromRecord(
    result,
    `Based on your measurements, we recommend Size ${result.size} (${result.soldTier}).`,
  );
}

/**
 * Simple-form recommendation (sleep position + body type + firmness).
 * Legacy mp-maker — includes hardcoded filling lines.
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
 * Bolster recommendation (height + sleep position) — Mbolster Rules Engine.
 */
export async function getBolsterRecommendation(
  input: BolsterPreferences,
): Promise<CustomizationResult & { recommendation_record?: RecommendationRecord }> {
  const result = await recommendWithEngine("mbolster", inputsFromBolsterHeight(input.height_cm));
  if ("error" in result) {
    throw new Error(result.error);
  }
  return ballparkFromRecord(
    result,
    `Height ${input.height_cm}cm → ${result.size} Mbolster.`,
  );
}
