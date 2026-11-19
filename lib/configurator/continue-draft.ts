/**
 * The continue link (ADR 0050): a guest reopens their own Draft Result from a
 * link, on any device, and carries on where they stopped.
 *
 * A Draft's answers are saved on the server as they are typed, but the
 * configurator only ever read them back in the browser that typed them, so a
 * reminder had nothing to send a shopper back to. The link carries the Draft's
 * id and its Result access token; the page checks the token
 * (lib/results/resume-draft.ts) and hands the answers to the configurator,
 * which opens on the first question left unanswered, or on the preview.
 *
 * Pure: the reminder email builds the link with it, and the page and the
 * configurator read the stored answers through it.
 */

import { pillowForOf, type PillowFor } from "@/lib/customer-pillow/pillow-for";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { stepOrderFor, type MpConfigStep, type MpConfigVariant } from "@/lib/mp-config/flow-variant";

/** The query that reopens a Draft: `?draft=<id>&token=<access token>`. */
export const CONTINUE_DRAFT_PARAM = "draft";

/** A Draft's answers, as the configurator holds them. */
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
  /** Who the pillow is for; only someone who already has one is asked. */
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

/**
 * The answers in a stored Draft's `data`, only those shaped as the
 * configurator holds them. A null or a stray type is left out rather than
 * passed on, so it can never replace a default the form relies on (an array
 * the health step reads `.length` of).
 */
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

/**
 * Which configurator the Draft was started in, recorded with the guest's email
 * on the first question (`data.configurator`). A Draft from before that was
 * recorded reopens in the full configurator.
 */
export function draftConfiguratorOf(stored: unknown): MpConfigVariant {
  return record(stored).configurator === "basic" ? "basic" : "full";
}

const filled = (v: string | undefined) => typeof v === "string" && v.trim() !== "";
const measured = (v: string | undefined) => filled(v) && Number.isFinite(Number(v));

/** Whether a question's answers are all there. Photos are optional, so never asked again. */
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
      // Can be below zero (HEAD_TO_BACK_MIN_CM), so any number counts.
      return measured(a.headToBack);
    case "neck-length":
      return measured(a.neckLength);
    default:
      return true;
  }
}

/**
 * Where a reopened Draft opens: the first question still unanswered, in this
 * configurator's order, or the preview once every one is. The welcome, *What
 * to expect* and the optional photos are never stopped on.
 */
export function resumeStepFor(variant: MpConfigVariant, answers: Partial<DraftAnswers>): MpConfigStep {
  for (const step of stepOrderFor(variant)) {
    if (step === "welcome" || step === "what-to-expect" || step === "photos" || step === "preview") continue;
    if (!answered(step, answers)) return step;
  }
  return "preview";
}

/** The configurator a Draft reopens in. */
export function continueDraftPath(variant: MpConfigVariant): string {
  return variant === "basic" ? "/mp-basic" : "/mp-config";
}

/** The continue link itself, as an email or Staff hand it out. */
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

/** The address bar after the page has adopted the Draft: the same URL, without the link's id and token. */
export function stripContinueDraftQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(CONTINUE_DRAFT_PARAM);
  params.delete("token");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
