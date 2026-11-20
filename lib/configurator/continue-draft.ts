import { pillowForOf, type PillowFor } from "@/lib/customer-pillow/pillow-for";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { stepOrderFor, type MpConfigStep, type MpConfigVariant } from "@/lib/mp-config/flow-variant";

export const CONTINUE_DRAFT_PARAM = "draft";

export type DraftAnswers = {
  name: string;
  gender: string;
  ageGroup: string;
  bloodPressureLevel: string;
  earDiscomfortSideSleep: "yes" | "no" | "";
  bedFirmness: string;
  acidReflux: "yes" | "no" | "";
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
  sleepPainAreas: string[];
  sleepPositionType: string[];
  usesBolster: "yes" | "no" | "";
  pillowFor?: PillowFor;
};

const TEXT_KEYS = [
  "name",
  "gender",
  "ageGroup",
  "bloodPressureLevel",
  "bedFirmness",
  "shoulderLength",
  "neckToBack",
  "headToBack",
  "neckLength",
] as const;
const YES_NO_KEYS = ["earDiscomfortSideSleep", "acidReflux", "usesBolster"] as const;
const LIST_KEYS = ["sleepPainAreas", "sleepPositionType"] as const;

function record(stored: unknown): Record<string, unknown> {
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {};
}

export function draftAnswersFrom(stored: unknown): Partial<DraftAnswers> {
  const data = record(stored);
  const out: Partial<DraftAnswers> = {};
  for (const key of TEXT_KEYS) {
    const v = data[key];
    if (typeof v === "string") out[key] = v;
  }
  for (const key of YES_NO_KEYS) {
    const v = data[key];
    if (v === "yes" || v === "no" || v === "") out[key] = v;
  }
  for (const key of LIST_KEYS) {
    const v = data[key];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[key] = [...v];
  }
  const pillowFor = pillowForOf(data);
  if (pillowFor) out.pillowFor = pillowFor;
  return out;
}

export function draftConfiguratorOf(stored: unknown): MpConfigVariant {
  return record(stored).configurator === "basic" ? "basic" : "full";
}

const filled = (v: string | undefined) => typeof v === "string" && v.trim() !== "";
const measured = (v: string | undefined) => filled(v) && Number.isFinite(Number(v));

function answered(step: MpConfigStep, a: Partial<DraftAnswers>): boolean {
  switch (step) {
    case "name":
      return filled(a.name);
    case "age":
      return filled(a.gender) && filled(a.ageGroup);
    case "health":
      return (
        filled(a.bloodPressureLevel) &&
        filled(a.earDiscomfortSideSleep) &&
        filled(a.bedFirmness) &&
        filled(a.acidReflux) &&
        (a.sleepPainAreas?.length ?? 0) > 0 &&
        (a.sleepPositionType?.length ?? 0) > 0 &&
        filled(a.usesBolster)
      );
    case "shoulder-length":
      return measured(a.shoulderLength);
    case "neck-to-back":
      return measured(a.neckToBack);
    case "head-to-back":
      return measured(a.headToBack);
    case "neck-length":
      return measured(a.neckLength);
    default:
      return true;
  }
}

export function resumeStepFor(variant: MpConfigVariant, answers: Partial<DraftAnswers>): MpConfigStep {
  for (const step of stepOrderFor(variant)) {
    if (step === "welcome" || step === "what-to-expect" || step === "photos" || step === "preview") continue;
    if (!answered(step, answers)) return step;
  }
  return "preview";
}

export function continueDraftPath(variant: MpConfigVariant): string {
  return variant === "basic" ? "/mp-basic" : "/mp-config";
}

export function continueDraftUrl(input: {
  origin: string;
  id: string;
  token: string;
  variant: MpConfigVariant;
  locale?: Locale;
}): string {
  const origin = input.origin.replace(/\/$/, "");
  const path = withLocale(continueDraftPath(input.variant), input.locale ?? DEFAULT_LOCALE);
  const query = new URLSearchParams({ [CONTINUE_DRAFT_PARAM]: input.id, token: input.token });
  return `${origin}${path}?${query.toString()}`;
}

export function stripContinueDraftQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(CONTINUE_DRAFT_PARAM);
  params.delete("token");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
