import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CustomerPreferences,
  MeasurementBasedPreferences,
  BolsterPreferences,
  CustomizationResult,
  FillingLine,
} from "@/lib/types/customization";

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
 * Get the LLM API config from the database.
 */
async function getLlmConfig(): Promise<{ base_url: string | null; api_key: string | null; config: Record<string, unknown> } | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("api_configs")
    .select("base_url, api_key, config")
    .eq("slug", "llm-customization")
    .eq("is_active", true)
    .single();

  return data ?? null;
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

// ─── Size Recommendation Logic ─────────────────────────────

const SIZE_MAP: Record<string, Record<string, string>> = {
  petite: { side: "S", back: "XS", stomach: "XS", mixed: "S" },
  average: { side: "M", back: "M", stomach: "S", mixed: "M" },
  large: { side: "L", back: "L", stomach: "M", mixed: "L" },
};

// ─── Firmness → Filling Logic ──────────────────────────────

interface FillingSpec {
  subtypes: string[];
  quantities: Record<string, number>;
}

const FILLING_SPECS: Record<string, Record<string, FillingSpec>> = {
  XS: {
    soft: { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
    "medium-soft": { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
    medium: { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
    "medium-firm": { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
    firm: { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
  },
  S: {
    soft: { subtypes: ["3D-S"], quantities: { "3D-S": 1 } },
    "medium-soft": { subtypes: ["3D-S"], quantities: { "3D-S": 2 } },
    medium: { subtypes: ["3D-S"], quantities: { "3D-S": 2 } },
    "medium-firm": { subtypes: ["3D-S"], quantities: { "3D-S": 2 } },
    firm: { subtypes: ["3D-S"], quantities: { "3D-S": 2 } },
  },
  M: {
    soft: { subtypes: ["3D-L"], quantities: { "3D-L": 1 } },
    "medium-soft": { subtypes: ["3D-L", "6D-S"], quantities: { "3D-L": 1, "6D-S": 1 } },
    medium: { subtypes: ["3D-L", "6D-S"], quantities: { "3D-L": 1, "6D-S": 1 } },
    "medium-firm": { subtypes: ["6D-S", "6D-L"], quantities: { "6D-S": 1, "6D-L": 1 } },
    firm: { subtypes: ["6D-L"], quantities: { "6D-L": 2 } },
  },
  L: {
    soft: { subtypes: ["3D-L"], quantities: { "3D-L": 2 } },
    "medium-soft": { subtypes: ["3D-L", "6D-L"], quantities: { "3D-L": 1, "6D-L": 1 } },
    medium: { subtypes: ["3D-L", "6D-L"], quantities: { "3D-L": 1, "6D-L": 1 } },
    "medium-firm": { subtypes: ["6D-L"], quantities: { "6D-L": 2 } },
    firm: { subtypes: ["6D-L", "6D-L+"], quantities: { "6D-L": 1, "6D-L+": 1 } },
  },
  XL: {
    soft: { subtypes: ["6D-L"], quantities: { "6D-L": 2 } },
    "medium-soft": { subtypes: ["6D-L"], quantities: { "6D-L": 2, "6D-L+": 1 } },
    medium: { subtypes: ["6D-L", "6D-L+"], quantities: { "6D-L": 2, "6D-L+": 1 } },
    "medium-firm": { subtypes: ["6D-L", "6D-L+"], quantities: { "6D-L": 2, "6D-L+": 1 } },
    firm: { subtypes: ["6D-L+"], quantities: { "6D-L+": 3 } },
  },
};

/**
 * Mock LLM implementation — rule-based filling recommendation.
 * Maps customer preferences to size + filling configuration.
 *
 * When the real LLM API is ready, replace the body of this function
 * with an HTTP call to the LLM endpoint from api_configs.
 */
export async function getFillingRecommendation(
  preferences: CustomerPreferences
): Promise<CustomizationResult> {
  const llmConfig = await getLlmConfig();

  // If a real LLM endpoint is configured and active, use it
  if (llmConfig?.base_url) {
    try {
      const response = await fetch(llmConfig.base_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmConfig.api_key ? { Authorization: `Bearer ${llmConfig.api_key}` } : {}),
        },
        body: JSON.stringify({
          preferences,
          config: llmConfig.config,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data as CustomizationResult;
      }
      // Fall through to mock if LLM call fails
    } catch {
      // Fall through to mock
    }
  }

  // ─── Mock Implementation ─────────────────────────────────
  const { sleep_position, body_type, firmness } = preferences;

  // Determine recommended size
  const recommendedSize = SIZE_MAP[body_type]?.[sleep_position] ?? "M";
  const recommendedKind = "basic";

  // Get filling spec for this size + firmness
  const spec = FILLING_SPECS[recommendedSize]?.[firmness] ?? FILLING_SPECS["M"]!["medium"]!;

  // Resolve filling items from DB
  const availableFillings = await getAvailableFillings();
  const fillingsBySubtype = new Map(availableFillings.map((f) => [f.subtype, f]));

  const filling_lines: FillingLine[] = [];
  for (const [subtype, qty] of Object.entries(spec.quantities)) {
    const filling = fillingsBySubtype.get(subtype);
    if (filling) {
      filling_lines.push({
        item_id: filling.item_id,
        subtype,
        name: filling.name,
        quantity: qty,
      });
    }
  }

  // Build summary
  const fillingDesc = filling_lines.map((f) => `${f.quantity}× ${f.subtype}`).join(", ");
  const firmLabel = firmness.replace("-", " ");

  return {
    recommended_size: recommendedSize,
    recommended_kind: recommendedKind,
    filling_lines,
    summary: `Size ${recommendedSize} — ${firmLabel}: ${fillingDesc}`,
    explanation: buildExplanation(preferences, recommendedSize, firmLabel),
  };
}

function buildExplanation(
  prefs: CustomerPreferences,
  size: string,
  firmLabel: string
): string {
  const positionExplanations: Record<string, string> = {
    side: "Side sleepers need higher loft to maintain proper neck alignment and fill the gap between the shoulder and head.",
    back: "Back sleepers need moderate loft to support the natural curve of the cervical spine without pushing the head forward.",
    stomach: "Stomach sleepers need a flatter pillow to avoid straining the neck and maintain a neutral spine position.",
    mixed: "Mixed sleepers benefit from a versatile pillow that adapts well across different sleeping positions.",
  };

  return `Based on your profile (${prefs.body_type} build, ${prefs.sleep_position} sleeper, ${firmLabel} preference), we recommend Size ${size}. ${positionExplanations[prefs.sleep_position] ?? ""}`;
}

// ─── Measurement-Based Recommendation ──────────────────────

/**
 * Derive body_type from shoulder width.
 */
function shoulderToBodyType(shoulderCm: number): "petite" | "average" | "large" {
  if (shoulderCm < 38) return "petite";
  if (shoulderCm <= 44) return "average";
  return "large";
}

/**
 * Derive dominant sleep position from the multi-select array.
 */
function deriveSleepPosition(types: string[]): "side" | "back" | "stomach" | "mixed" {
  if (types.length === 0) return "mixed";
  if (types.length > 1 || types.includes("side-and-back")) return "mixed";
  if (types.includes("side")) return "side";
  if (types.includes("back")) return "back";
  if (types.includes("stomach")) return "stomach";
  return "mixed";
}

/**
 * Derive firmness from bed firmness + health factors.
 */
function deriveFirmness(
  bedFirmness: string,
  health: MeasurementBasedPreferences["health"]
): "soft" | "medium-soft" | "medium" | "medium-firm" | "firm" {
  // Start from bed firmness preference
  const firmnessScale = ["soft", "medium-soft", "medium", "medium-firm", "firm"] as const;
  let index = bedFirmness === "firm" ? 4 : bedFirmness === "medium-soft" ? 1 : 2; // default medium

  // Adjustments based on health conditions
  if (health.ear_discomfort_side_sleep) index = Math.max(0, index - 1); // softer for ear discomfort
  if (health.acid_reflux) index = Math.min(4, index + 1); // firmer for acid reflux (elevation)
  if (health.sleep_pain_areas.includes("neck")) index = Math.max(0, index - 1); // softer for neck pain
  if (health.sleep_pain_areas.includes("shoulder")) index = Math.max(0, index - 1); // softer for shoulder pain

  return firmnessScale[Math.max(0, Math.min(4, index))];
}

/**
 * Measurement-based recommendation — uses physical measurements + health data.
 * Mock implementation maps measurements to the same size/filling system.
 * When real LLM is configured, sends all data to the LLM endpoint.
 */
export async function getRecommendationFromMeasurements(
  input: MeasurementBasedPreferences
): Promise<CustomizationResult> {
  const llmConfig = await getLlmConfig();

  // If a real LLM endpoint is configured, send the full measurement data
  if (llmConfig?.base_url) {
    try {
      const response = await fetch(llmConfig.base_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmConfig.api_key ? { Authorization: `Bearer ${llmConfig.api_key}` } : {}),
        },
        body: JSON.stringify({
          measurement_preferences: input,
          config: llmConfig.config,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data as CustomizationResult;
      }
    } catch {
      // Fall through to mock
    }
  }

  // ─── Mock Implementation ─────────────────────────────────
  const bodyType = shoulderToBodyType(input.measurements.shoulder_length_cm);
  const sleepPosition = deriveSleepPosition(input.health.sleep_position_type);
  const firmness = deriveFirmness(input.health.bed_firmness, input.health);

  const recommendedSize = SIZE_MAP[bodyType]?.[sleepPosition] ?? "M";
  const recommendedKind = "basic";

  const spec = FILLING_SPECS[recommendedSize]?.[firmness] ?? FILLING_SPECS["M"]!["medium"]!;

  const availableFillings = await getAvailableFillings();
  const fillingsBySubtype = new Map(availableFillings.map((f) => [f.subtype, f]));

  const filling_lines: FillingLine[] = [];
  for (const [subtype, qty] of Object.entries(spec.quantities)) {
    const filling = fillingsBySubtype.get(subtype);
    if (filling) {
      filling_lines.push({
        item_id: filling.item_id,
        subtype,
        name: filling.name,
        quantity: qty,
      });
    }
  }

  const fillingDesc = filling_lines.map((f) => `${f.quantity}× ${f.subtype}`).join(", ");
  const firmLabel = firmness.replace("-", " ");

  // Build rich explanation using measurement + health data
  const reasons: string[] = [];
  reasons.push(`Shoulder width ${input.measurements.shoulder_length_cm}cm → ${bodyType} build`);
  reasons.push(`Sleep style: ${sleepPosition} sleeper`);
  reasons.push(`Bed firmness "${input.health.bed_firmness}" → pillow firmness: ${firmLabel}`);
  if (input.health.ear_discomfort_side_sleep) reasons.push("Adjusted softer for ear discomfort during side sleep");
  if (input.health.acid_reflux) reasons.push("Adjusted firmer for acid reflux support");
  if (input.health.sleep_pain_areas.length > 0) {
    reasons.push(`Sleep issues noted: ${input.health.sleep_pain_areas.join(", ")}`);
  }

  return {
    recommended_size: recommendedSize,
    recommended_kind: recommendedKind,
    filling_lines,
    summary: `Size ${recommendedSize} — ${firmLabel}: ${fillingDesc}`,
    explanation: `Based on your measurements and health profile, we recommend Size ${recommendedSize} (${recommendedKind}). ${reasons.join(". ")}.`,
  };
}

// ─── Bolster Recommendation ────────────────────────────────

/**
 * Mock bolster recommendation — maps height to size.
 */
export async function getBolsterRecommendation(
  input: BolsterPreferences
): Promise<CustomizationResult> {
  const llmConfig = await getLlmConfig();

  if (llmConfig?.base_url) {
    try {
      const response = await fetch(llmConfig.base_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmConfig.api_key ? { Authorization: `Bearer ${llmConfig.api_key}` } : {}),
        },
        body: JSON.stringify({
          bolster_preferences: input,
          config: llmConfig.config,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data as CustomizationResult;
      }
    } catch {
      // Fall through to mock
    }
  }

  // Mock: height-based sizing (same logic as mbolster-config)
  const heightM = input.height_cm / 100;
  let size: string;
  let reason: string;
  if (heightM < 1.5) {
    size = "S";
    reason = `Height ${heightM.toFixed(2)}m → Size S`;
  } else if (heightM <= 1.8) {
    size = "M";
    reason = `Height ${heightM.toFixed(2)}m → Size M`;
  } else {
    size = "L";
    reason = `Height ${heightM.toFixed(2)}m → Size L`;
  }

  // Bolsters don't have complex filling configurations like pillows
  // but we return the same type for API consistency
  return {
    recommended_size: size,
    recommended_kind: "basic",
    filling_lines: [],
    summary: `Mbolster Size ${size}`,
    explanation: `${reason}. ${input.sleep_position === "side" ? "Side sleepers benefit most from bolster support between the knees." : input.sleep_position === "stomach" ? "Consider the duo face cover option for stomach sleeping." : "Flexible recommendation for varied sleep positions."}`,
  };
}
