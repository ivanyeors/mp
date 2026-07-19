import type { InputDef, RuleFlow } from "./types";

/** Shared customize-step answers collected by Premium + Basic. */
const CUSTOMIZE_INPUTS: readonly InputDef[] = [
  {
    key: "sleep_position",
    valueType: "enum",
    values: ["side", "back", "stomach", "mixed"] as const,
  },
  {
    key: "bed_firmness",
    valueType: "enum",
    values: ["soft", "medium-soft", "medium", "medium-firm", "firm"] as const,
  },
  { key: "acid_reflux", valueType: "boolean", values: ["true", "false"] as const },
  {
    key: "ear_discomfort_side_sleep",
    valueType: "boolean",
    values: ["true", "false"] as const,
  },
  {
    key: "blood_pressure",
    valueType: "enum",
    values: ["low", "normal", "high"] as const,
  },
  {
    key: "sleep_pain_areas",
    valueType: "string[]",
    values: ["none", "neck", "shoulder", "back", "hip", "other"] as const,
  },
  { key: "uses_bolster", valueType: "boolean", values: ["true", "false"] as const },
  {
    key: "gender",
    valueType: "enum",
    values: ["female", "male", "other", "prefer-not"] as const,
  },
  {
    key: "age_group",
    valueType: "enum",
    values: ["under-25", "25-34", "35-44", "45-54", "55-64", "65-plus"] as const,
  },
];

const PREMIUM_CATALOG: readonly InputDef[] = [
  { key: "shoulder_length_cm", valueType: "number" },
  { key: "neck_to_back_cm", valueType: "number" },
  { key: "head_to_back_cm", valueType: "number" },
  { key: "neck_length_cm", valueType: "number" },
  ...CUSTOMIZE_INPUTS,
];

const BASIC_CATALOG: readonly InputDef[] = [
  { key: "shoulder_length_cm", valueType: "number" },
  ...CUSTOMIZE_INPUTS,
];

const MBOLSTER_CATALOG: readonly InputDef[] = [
  { key: "height_cm", valueType: "number" },
];

const CATALOGS: Record<RuleFlow, readonly InputDef[]> = {
  "premium-mpillow": PREMIUM_CATALOG,
  "basic-mpillow": BASIC_CATALOG,
  mbolster: MBOLSTER_CATALOG,
};

export function inputCatalog(flow: RuleFlow): readonly InputDef[] {
  return CATALOGS[flow];
}

export function catalogKeys(flow: RuleFlow): ReadonlySet<string> {
  return new Set(inputCatalog(flow).map((d) => d.key));
}

export function catalogDef(flow: RuleFlow, key: string): InputDef | undefined {
  return inputCatalog(flow).find((d) => d.key === key);
}

/** All catalog keys are required — missing any is a hard evaluation error. */
export function missingRequiredInputs(
  flow: RuleFlow,
  inputs: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const def of inputCatalog(flow)) {
    const v = inputs[def.key];
    if (v === undefined || v === null || v === "") {
      missing.push(def.key);
      continue;
    }
    if (def.valueType === "string[]" && (!Array.isArray(v) || v.length === 0)) {
      missing.push(def.key);
    }
  }
  return missing;
}
