import type { EngineInputs, RuleGraphJson } from "./types";

/**
 * Minimal hand-written Premium graph for slice 01 round-trip:
 * shoulder → size → size-scoped template; Fallback catch-all (no inbound).
 * Bands mirror in-store XS–XL (cm).
 */
export function premiumHandGraph(templateIds: {
  XS: string;
  S: string;
  M: string;
  L: string;
  XL: string;
}): RuleGraphJson {
  const t = templateIds;
  return {
    nodes: [
      { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
      {
        id: "rng-shoulder",
        type: "range",
        inputKey: "shoulder_length_cm",
        bands: [
          { id: "b-xs", minCm: null, maxCm: 36, label: "XS" },
          { id: "b-s", minCm: 36, maxCm: 40, label: "S" },
          { id: "b-m", minCm: 40, maxCm: 46, label: "M" },
          { id: "b-l", minCm: 46, maxCm: 52, label: "L" },
          { id: "b-xl", minCm: 52, maxCm: null, label: "XL" },
        ],
      },
      { id: "sz-xs", type: "size-output", size: "XS" },
      { id: "sz-s", type: "size-output", size: "S" },
      { id: "sz-m", type: "size-output", size: "M" },
      { id: "sz-l", type: "size-output", size: "L" },
      { id: "sz-xl", type: "size-output", size: "XL" },
      { id: "tpl-xs", type: "template-output", templateId: t.XS, size: "XS" },
      { id: "tpl-s", type: "template-output", templateId: t.S, size: "S" },
      { id: "tpl-m", type: "template-output", templateId: t.M, size: "M" },
      { id: "tpl-l", type: "template-output", templateId: t.L, size: "L" },
      { id: "tpl-xl", type: "template-output", templateId: t.XL, size: "XL" },
      { id: "fb", type: "fallback", size: "M", templateId: t.M },
    ],
    edges: [
      { id: "e0", source: "in-shoulder", target: "rng-shoulder" },
      { id: "e1", source: "rng-shoulder", target: "sz-xs", handle: "b-xs" },
      { id: "e2", source: "rng-shoulder", target: "sz-s", handle: "b-s" },
      { id: "e3", source: "rng-shoulder", target: "sz-m", handle: "b-m" },
      { id: "e4", source: "rng-shoulder", target: "sz-l", handle: "b-l" },
      { id: "e5", source: "rng-shoulder", target: "sz-xl", handle: "b-xl" },
      { id: "e6", source: "sz-xs", target: "tpl-xs" },
      { id: "e7", source: "sz-s", target: "tpl-s" },
      { id: "e8", source: "sz-m", target: "tpl-m" },
      { id: "e9", source: "sz-l", target: "tpl-l" },
      { id: "e10", source: "sz-xl", target: "tpl-xl" },
    ],
  };
}

/** Full Premium catalog sample inputs (deterministic). */
export function premiumSampleInputs(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    shoulder_length_cm: 42,
    neck_to_back_cm: 10,
    head_to_back_cm: 12,
    neck_length_cm: 10,
    sleep_position: "side",
    bed_firmness: "medium",
    acid_reflux: false,
    ear_discomfort_side_sleep: false,
    blood_pressure: "normal",
    sleep_pain_areas: ["none"],
    uses_bolster: false,
    gender: "female",
    age_group: "35-44",
    ...overrides,
  };
}

export const DEFAULT_TEMPLATE_IDS = {
  XS: "tpl-xs-default",
  S: "tpl-s-default",
  M: "tpl-m-default",
  L: "tpl-l-default",
  XL: "tpl-xl-default",
} as const;
