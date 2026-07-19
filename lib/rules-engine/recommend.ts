/**
 * Single recommendation authority: evaluate published graph, with bootstrap
 * fallback to legacy rules while a flow has no published version.
 */
import {
  inferSizeFromMeasurements,
  inferTierFromQuestions,
} from "@/lib/results/instore-ballpark";
import { recommendBasicMpillow } from "@/lib/mp-basic/recommend";
import {
  recommendBolster,
  recommendSizeFromMeasurements,
  deriveSleepPosition,
} from "@/lib/shop/recommendation/rules";
import type { MeasurementBasedPreferences } from "@/lib/types/customization";
import { evaluate } from "./evaluate";
import { getLatestPublished } from "./persist";
import {
  legacyBootstrapRecord,
  recordFromEvaluate,
  type RecommendationRecord,
} from "./recommendation-record";
import type { EngineInputs, RuleFlow, SizeOrLength } from "./types";

export type { RecommendationRecord };

export type RecommendOk = RecommendationRecord;
export type RecommendErr = { error: string; missing?: string[] };

const FLOW_SOLD_TIER: Record<RuleFlow, "basic" | "premium" | null> = {
  "premium-mpillow": "premium",
  "basic-mpillow": "basic",
  mbolster: null,
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** mp-config camelCase response.data → Premium engine inputs (graph-referenced keys). */
export function inputsFromMpConfigData(data: Record<string, unknown>): EngineInputs {
  const out: EngineInputs = {};
  const shoulder = toNum(data.shoulderLength);
  const ntb = toNum(data.neckToBack);
  const htb = toNum(data.headToBack);
  const nl = toNum(data.neckLength);
  if (shoulder != null) out.shoulder_length_cm = shoulder;
  if (ntb != null) out.neck_to_back_cm = ntb;
  if (htb != null) out.head_to_back_cm = htb;
  if (nl != null) out.neck_length_cm = nl;

  if (data.bedFirmness) out.bed_firmness = String(data.bedFirmness);
  if (data.acidReflux === "yes" || data.acidReflux === true) out.acid_reflux = true;
  else if (data.acidReflux === "no" || data.acidReflux === false) out.acid_reflux = false;
  if (data.earDiscomfortSideSleep === "yes" || data.earDiscomfortSideSleep === true) {
    out.ear_discomfort_side_sleep = true;
  } else if (data.earDiscomfortSideSleep === "no" || data.earDiscomfortSideSleep === false) {
    out.ear_discomfort_side_sleep = false;
  }
  if (data.bloodPressureLevel) out.blood_pressure = String(data.bloodPressureLevel);
  if (data.gender) out.gender = String(data.gender);
  if (data.ageGroup) out.age_group = String(data.ageGroup);
  return out;
}

/** Shop customize measurement_preferences → Premium engine inputs. */
export function inputsFromMeasurementPrefs(input: MeasurementBasedPreferences): EngineInputs {
  return {
    shoulder_length_cm: input.measurements.shoulder_length_cm,
    neck_to_back_cm: input.measurements.neck_to_back_cm,
    head_to_back_cm: input.measurements.head_to_back_cm,
    neck_length_cm: input.measurements.neck_length_cm,
    sleep_position: deriveSleepPosition(input.health.sleep_position_type),
    bed_firmness: input.health.bed_firmness,
    acid_reflux: input.health.acid_reflux,
    ear_discomfort_side_sleep: input.health.ear_discomfort_side_sleep,
    blood_pressure: input.health.blood_pressure,
    sleep_pain_areas:
      input.health.sleep_pain_areas.length > 0 ? input.health.sleep_pain_areas : ["none"],
    uses_bolster: input.health.uses_bolster,
    gender: input.demographics.gender,
    age_group: input.demographics.age_group,
  };
}

export function inputsFromBasicShoulder(shoulderLengthCm: number): EngineInputs {
  return { shoulder_length_cm: shoulderLengthCm };
}

export function inputsFromBolsterHeight(heightCm: number): EngineInputs {
  return { height_cm: heightCm };
}

/** Map legacy bolster S/M/L → length keys. */
export function bolsterSizeToLength(size: string): SizeOrLength {
  if (size === "S" || size === "short") return "short";
  if (size === "L" || size === "long") return "long";
  return "medium";
}

export function lengthToBolsterLetter(length: SizeOrLength): "S" | "M" | "L" {
  if (length === "short" || length === "S") return "S";
  if (length === "long" || length === "L") return "L";
  return "M";
}

type LatestFn = typeof getLatestPublished;

/**
 * Evaluate the published graph for `flow`, or fall back to legacy rules.
 * // ponytail: bootstrap guard — delete once all three seeds are published in every env
 */
export async function recommendWithEngine(
  flow: RuleFlow,
  inputs: EngineInputs,
  opts?: { getLatestPublished?: LatestFn },
): Promise<RecommendOk | RecommendErr> {
  const load = opts?.getLatestPublished ?? getLatestPublished;
  const published = await load(flow);
  const soldTier = FLOW_SOLD_TIER[flow];

  if (!published) {
    return legacyRecommend(flow, inputs, soldTier);
  }

  const result = evaluate(flow, published.graph, inputs);
  if ("error" in result) return result;

  return recordFromEvaluate(flow, published.id, result, soldTier);
}

function legacyRecommend(
  flow: RuleFlow,
  inputs: EngineInputs,
  soldTier: "basic" | "premium" | null,
): RecommendOk {
  if (flow === "premium-mpillow") {
    const shoulder = inputs.shoulder_length_cm;
    const data = {
      shoulderLength: shoulder != null ? String(shoulder) : "",
      acidReflux: inputs.acid_reflux === true ? "yes" : "no",
      earDiscomfortSideSleep: inputs.ear_discomfort_side_sleep === true ? "yes" : "no",
    };
    const size = inferSizeFromMeasurements(data).size;
    const tier = inferTierFromQuestions(data).tier;
    // Sold tier stays flow-scoped premium; advisory tier mirrors legacy questions.
    return legacyBootstrapRecord(flow, size, soldTier, tier);
  }

  if (flow === "basic-mpillow") {
    const shoulder = Number(inputs.shoulder_length_cm);
    const r = recommendBasicMpillow({
      shoulderLength: Number.isFinite(shoulder) ? String(shoulder) : "",
    });
    return legacyBootstrapRecord(flow, r.recommended_size, "basic", "basic");
  }

  // mbolster
  const height = Number(inputs.height_cm);
  const r = recommendBolster({
    height_cm: Number.isFinite(height) ? height : 170,
    sleep_position: "side",
  });
  return legacyBootstrapRecord(flow, bolsterSizeToLength(r.recommended_size), null, null);
}

/** Pure legacy size for seed-equivalence (Premium/Basic shoulder). */
export function legacyShoulderSize(shoulderCm: number): SizeOrLength {
  return inferSizeFromMeasurements({ shoulderLength: String(shoulderCm) }).size;
}

/** Pure legacy bolster length for seed-equivalence. */
export function legacyBolsterLength(heightCm: number): SizeOrLength {
  return bolsterSizeToLength(
    recommendBolster({ height_cm: heightCm, sleep_position: "side" }).recommended_size,
  );
}

/**
 * Legacy SIZE_MAP path kept for mp-maker / bootstrap only.
 * Premium online ballpark must not use this (hardcoded basic).
 */
export function legacyOnlineMeasurementBallpark(input: MeasurementBasedPreferences) {
  return recommendSizeFromMeasurements(input);
}
