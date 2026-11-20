import { deriveSleepPosition } from "@/lib/shop/recommendation/rules";
import type { MeasurementBasedPreferences } from "@/lib/types/customization";
import { missingRequiredInputs } from "./catalog";
import { HEAD_TO_BACK_MIN_CM } from "./units";
import type { EngineInputs, RuleFlow } from "./types";

export type WizardMeasurementData = {
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
  gender: string;
  ageGroup: string;
  bloodPressureLevel: string;
  earDiscomfortSideSleep: string;
  bedFirmness: string;
  acidReflux: string;
  sleepPainAreas: string[];
  sleepPositionType: string[];
  usesBolster: string;
};

function positiveCm(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function headToBackCm(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= HEAD_TO_BACK_MIN_CM ? n : undefined;
}

function yesNo(raw: string): boolean | undefined {
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return undefined;
}

export function wizardToEngineInputs(data: WizardMeasurementData): EngineInputs {
  const sleepTypes = data.sleepPositionType;
  return {
    shoulder_length_cm: positiveCm(data.shoulderLength),
    neck_to_back_cm: positiveCm(data.neckToBack),
    head_to_back_cm: headToBackCm(data.headToBack),
    neck_length_cm: positiveCm(data.neckLength),
    sleep_position:
      sleepTypes.length > 0 ? deriveSleepPosition(sleepTypes) : undefined,
    bed_firmness: data.bedFirmness.trim() || undefined,
    acid_reflux: yesNo(data.acidReflux),
    ear_discomfort_side_sleep: yesNo(data.earDiscomfortSideSleep),
    blood_pressure: data.bloodPressureLevel.trim() || undefined,
    sleep_pain_areas: data.sleepPainAreas,
    uses_bolster: yesNo(data.usesBolster),
    gender: data.gender.trim() || undefined,
    age_group: data.ageGroup.trim() || undefined,
  };
}

export function measurementPrefsToEngineInputs(
  prefs: MeasurementBasedPreferences,
): EngineInputs {
  const m = prefs.measurements;
  const h = prefs.health;
  const d = prefs.demographics;
  return {
    shoulder_length_cm: m.shoulder_length_cm,
    neck_to_back_cm: m.neck_to_back_cm,
    head_to_back_cm: m.head_to_back_cm,
    neck_length_cm: m.neck_length_cm,
    sleep_position:
      h.sleep_position_type.length > 0
        ? deriveSleepPosition(h.sleep_position_type)
        : undefined,
    bed_firmness: h.bed_firmness?.trim() || undefined,
    acid_reflux: h.acid_reflux,
    ear_discomfort_side_sleep: h.ear_discomfort_side_sleep,
    blood_pressure: h.blood_pressure?.trim() || undefined,
    sleep_pain_areas: h.sleep_pain_areas,
    uses_bolster: h.uses_bolster,
    gender: d.gender?.trim() || undefined,
    age_group: d.age_group?.trim() || undefined,
  };
}

export function basicBodyToEngineInputs(body: {
  shoulderLength: string;
  gender?: string;
  ageGroup?: string;
  bloodPressureLevel?: string;
  bedFirmness?: string;
  earDiscomfortSideSleep?: string;
  acidReflux?: string;
  sleepPainAreas?: string[];
  sleepPositionType?: string[];
  usesBolster?: string;
}): EngineInputs {
  return wizardToEngineInputs({
    shoulderLength: body.shoulderLength,
    neckToBack: "",
    headToBack: "",
    neckLength: "",
    gender: body.gender ?? "",
    ageGroup: body.ageGroup ?? "",
    bloodPressureLevel: body.bloodPressureLevel ?? "",
    earDiscomfortSideSleep: body.earDiscomfortSideSleep ?? "",
    bedFirmness: body.bedFirmness ?? "",
    acidReflux: body.acidReflux ?? "",
    sleepPainAreas: body.sleepPainAreas ?? [],
    sleepPositionType: body.sleepPositionType ?? [],
    usesBolster: body.usesBolster ?? "",
  });
}

export function incompleteEngineInputs(
  flow: RuleFlow,
  inputs: EngineInputs,
): string[] {
  return missingRequiredInputs(flow, inputs);
}
