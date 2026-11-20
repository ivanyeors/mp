import type {
  CustomerPreferences,
  MeasurementBasedPreferences,
  BolsterPreferences,
  CustomizationResult,
  FillingLine,
} from "@/lib/types/customization";

export interface AvailableFilling {
  item_id: number;
  subtype: string;
  name: string;
  on_hand?: number;
}

export const SIZE_MAP: Record<string, Record<string, string>> = {
  petite: { side: "S", back: "XS", stomach: "XS", mixed: "S" },
  average: { side: "M", back: "M", stomach: "S", mixed: "M" },
  large: { side: "L", back: "L", stomach: "M", mixed: "L" },
};

interface FillingSpec {
  subtypes: string[];
  quantities: Record<string, number>;
}

// ponytail: mp-maker / customize?action=apply legacy only — online purchase path uses
// recommendSize* (empty filling_lines); sold fillings come from Filling Templates (slice 12).
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

export function resolveFillingLines(
  quantities: Record<string, number>,
  availableFillings: AvailableFilling[],
): FillingLine[] {
  const fillingsBySubtype = new Map(availableFillings.map((f) => [f.subtype, f]));
  const lines: FillingLine[] = [];
  for (const [subtype, qty] of Object.entries(quantities)) {
    const filling = fillingsBySubtype.get(subtype);
    if (filling) {
      lines.push({ item_id: filling.item_id, subtype, name: filling.name, quantity: qty });
    }
  }
  return lines;
}

function specFor(size: string, firmness: string): FillingSpec {
  return FILLING_SPECS[size]?.[firmness] ?? FILLING_SPECS["M"]!["medium"]!;
}

function buildExplanation(prefs: CustomerPreferences, size: string, firmLabel: string): string {
  const positionExplanations: Record<string, string> = {
    side: "Side sleepers need higher loft to maintain proper neck alignment and fill the gap between the shoulder and head.",
    back: "Back sleepers need moderate loft to support the natural curve of the cervical spine without pushing the head forward.",
    stomach: "Stomach sleepers need a flatter pillow to avoid straining the neck and maintain a neutral spine position.",
    mixed: "Mixed sleepers benefit from a versatile pillow that adapts well across different sleeping positions.",
  };
  return `Based on your profile (${prefs.body_type} build, ${prefs.sleep_position} sleeper, ${firmLabel} preference), we recommend Size ${size}. ${positionExplanations[prefs.sleep_position] ?? ""}`;
}

// ponytail: bootstrap/legacy only — shop ballpark uses lib/rules-engine/recommend when published
export function recommendSizeFromPreferences(
  preferences: CustomerPreferences,
): CustomizationResult {
  const { sleep_position, body_type, firmness } = preferences;
  const recommendedSize = SIZE_MAP[body_type]?.[sleep_position] ?? "M";
  const recommendedKind = "basic";
  const firmLabel = firmness.replace("-", " ");
  return {
    recommended_size: recommendedSize,
    recommended_kind: recommendedKind,
    filling_lines: [],
    summary: `Size ${recommendedSize} — ${firmLabel}`,
    explanation: buildExplanation(preferences, recommendedSize, firmLabel),
  };
}

// ponytail: bootstrap/legacy + mp-maker — Premium online uses rules-engine (sold tier premium)
export function recommendSizeFromMeasurements(
  input: MeasurementBasedPreferences,
): CustomizationResult {
  const bodyType = shoulderToBodyType(input.measurements.shoulder_length_cm);
  const sleepPosition = deriveSleepPosition(input.health.sleep_position_type);
  const firmness = deriveFirmness(input.health.bed_firmness, input.health);
  const recommendedSize = SIZE_MAP[bodyType]?.[sleepPosition] ?? "M";
  const recommendedKind = "basic";
  const firmLabel = firmness.replace("-", " ");

  const reasons: string[] = [];
  reasons.push(`Shoulder width ${input.measurements.shoulder_length_cm}cm → ${bodyType} build`);
  reasons.push(`Sleep style: ${sleepPosition} sleeper`);
  reasons.push(`Bed firmness "${input.health.bed_firmness}" → pillow firmness: ${firmLabel}`);
  if (input.health.ear_discomfort_side_sleep) {
    reasons.push("Adjusted softer for ear discomfort during side sleep");
  }
  if (input.health.acid_reflux) reasons.push("Adjusted firmer for acid reflux support");
  if (input.health.sleep_pain_areas.length > 0) {
    reasons.push(`Sleep issues noted: ${input.health.sleep_pain_areas.join(", ")}`);
  }

  return {
    recommended_size: recommendedSize,
    recommended_kind: recommendedKind,
    filling_lines: [],
    summary: `Size ${recommendedSize} — ${firmLabel}`,
    explanation: `Based on your measurements and health profile, we recommend Size ${recommendedSize} (${recommendedKind}). ${reasons.join(". ")}.`,
  };
}

export function recommendFromPreferences(
  preferences: CustomerPreferences,
  availableFillings: AvailableFilling[],
): CustomizationResult {
  const { sleep_position, body_type, firmness } = preferences;

  const recommendedSize = SIZE_MAP[body_type]?.[sleep_position] ?? "M";
  const recommendedKind = "basic";

  const spec = specFor(recommendedSize, firmness);
  const filling_lines = resolveFillingLines(spec.quantities, availableFillings);

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

export function shoulderToBodyType(shoulderCm: number): "petite" | "average" | "large" {
  if (shoulderCm < 38) return "petite";
  if (shoulderCm <= 44) return "average";
  return "large";
}

export function deriveSleepPosition(types: string[]): "side" | "back" | "stomach" | "mixed" {
  if (types.length === 0) return "mixed";
  if (types.length > 1 || types.includes("side-and-back")) return "mixed";
  if (types.includes("side")) return "side";
  if (types.includes("back")) return "back";
  if (types.includes("stomach")) return "stomach";
  return "mixed";
}

export function deriveFirmness(
  bedFirmness: string,
  health: MeasurementBasedPreferences["health"],
): "soft" | "medium-soft" | "medium" | "medium-firm" | "firm" {
  const firmnessScale = ["soft", "medium-soft", "medium", "medium-firm", "firm"] as const;
  let index = bedFirmness === "firm" ? 4 : bedFirmness === "medium-soft" ? 1 : 2;

  if (health.ear_discomfort_side_sleep) index = Math.max(0, index - 1);
  if (health.acid_reflux) index = Math.min(4, index + 1);
  if (health.sleep_pain_areas.includes("neck")) index = Math.max(0, index - 1);
  if (health.sleep_pain_areas.includes("shoulder")) index = Math.max(0, index - 1);

  return firmnessScale[Math.max(0, Math.min(4, index))];
}

export function recommendFromMeasurements(
  input: MeasurementBasedPreferences,
  availableFillings: AvailableFilling[],
): CustomizationResult {
  const bodyType = shoulderToBodyType(input.measurements.shoulder_length_cm);
  const sleepPosition = deriveSleepPosition(input.health.sleep_position_type);
  const firmness = deriveFirmness(input.health.bed_firmness, input.health);

  const recommendedSize = SIZE_MAP[bodyType]?.[sleepPosition] ?? "M";
  const recommendedKind = "basic";

  const spec = specFor(recommendedSize, firmness);
  const filling_lines = resolveFillingLines(spec.quantities, availableFillings);

  const fillingDesc = filling_lines.map((f) => `${f.quantity}× ${f.subtype}`).join(", ");
  const firmLabel = firmness.replace("-", " ");

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

// ponytail: bootstrap/legacy — mbolster ballpark uses lib/rules-engine/recommend when published
export function recommendBolster(input: BolsterPreferences): CustomizationResult {
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

  return {
    recommended_size: size,
    recommended_kind: "basic",
    filling_lines: [],
    summary: `Mbolster Size ${size}`,
    explanation: `${reason}. ${
      input.sleep_position === "side"
        ? "Side sleepers benefit most from bolster support between the knees."
        : input.sleep_position === "stomach"
          ? "Consider the duo face cover option for stomach sleeping."
          : "Flexible recommendation for varied sleep positions."
    }`,
  };
}
