import type { MpConfigStep } from "@/lib/mp-config/flow-variant";
import { catalogKeys } from "./catalog";
import type { EngineInputs, RuleFlow } from "./types";

export const FLOW_ROUTE_EXPECTATION =
  "Upgrading to Mpillow takes about 2 minutes of extra measuring.";

const AGE_KEYS = ["gender", "age_group"] as const;

const HEALTH_KEYS = [
  "sleep_position",
  "bed_firmness",
  "acid_reflux",
  "ear_discomfort_side_sleep",
  "blood_pressure",
  "sleep_pain_areas",
  "uses_bolster",
] as const;

const STEP_INPUT_KEYS: Record<MpConfigStep, readonly string[] | null> = {
  welcome: null,
  "what-to-expect": null,
  name: null,
  age: AGE_KEYS,
  health: HEALTH_KEYS,
  "shoulder-length": ["shoulder_length_cm"],
  "neck-to-back": ["neck_to_back_cm"],
  "head-to-back": ["head_to_back_cm"],
  "neck-length": ["neck_length_cm"],
  photos: null,
  preview: null,
};

const SUBMIT_STEP: MpConfigStep = "photos";

// ponytail: fixed pair table; upgrade path = derive from target catalog + step map
const EXPECTED_MISSING: Partial<
  Record<`${RuleFlow}->${RuleFlow}`, readonly MpConfigStep[]>
> = {
  "basic-mpillow->premium-mpillow": ["neck-to-back", "head-to-back", "neck-length"],
  "mbolster->premium-mpillow": [
    "age",
    "health",
    "shoulder-length",
    "neck-to-back",
    "head-to-back",
    "neck-length",
    "photos",
  ],
  "mbolster->basic-mpillow": ["age", "health", "shoulder-length", "photos"],
};

function pairKey(from: RuleFlow, to: RuleFlow): `${RuleFlow}->${RuleFlow}` {
  return `${from}->${to}`;
}

function inputPresent(inputs: EngineInputs, key: string): boolean {
  const v = inputs[key];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function stepComplete(step: MpConfigStep, inputs: EngineInputs): boolean {
  if (step === SUBMIT_STEP) return false;
  const keys = STEP_INPUT_KEYS[step];
  if (!keys) return true;
  return keys.every((k) => inputPresent(inputs, k));
}

export function carryOverAnswers(
  from: RuleFlow,
  to: RuleFlow,
  answers: EngineInputs,
): EngineInputs {
  const shared = catalogKeys(from);
  const target = catalogKeys(to);
  const out: EngineInputs = {};
  for (const [key, value] of Object.entries(answers)) {
    if (shared.has(key) && target.has(key)) out[key] = value;
  }
  return out;
}

export function missingStepsAfterCarryOver(
  from: RuleFlow,
  to: RuleFlow,
  carried: EngineInputs,
): MpConfigStep[] {
  const expected = EXPECTED_MISSING[pairKey(from, to)];
  if (!expected) return [];
  return expected.filter((step) => !stepComplete(step, carried));
}
