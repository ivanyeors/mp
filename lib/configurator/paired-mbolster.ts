/**
 * The Paired build stepper (ADR 0026). When the Mpillow's Rule graph routes to
 * Mbolster, the preview becomes a four-step order:
 *
 *   1 Mpillow · 2 Mbolster (optional) · 3 Details · 4 Review
 *
 * Both builds are customised before anything else is asked. Step 2 is the
 * Mbolster configurator itself, in paired mode: it asks only for height, then
 * shows its own customisation page — case, add-ons, and the Staff x-ray editor —
 * and hands its answer back. Steps 3 and 4 are the Mpillow page's, because a
 * pair's contact, address and shipping are the anchor's: contact and shipping,
 * then a summary of both builds, then the one hold for both. Pure; both
 * configurators share these.
 */
import { parseRecommendationRecord } from "@/lib/rules-engine/recommendation-record";
import { withJourneyOnAccept, withJourneyOnDecline } from "@/lib/rules-engine/journey";
import type { RuleFlow } from "@/lib/rules-engine/types";

/** sessionStorage: the pair as the shopper has built it so far, shared by both pages. */
export const PAIRED_HANDOFF_KEY = "mp_paired_build_handoff";

/** Step 2's page, in paired mode. */
export const PAIRED_MBOLSTER_PATH = "/mbolster-config?paired=1";

export type BolsterSleepPosition = "side" | "stomach" | "other";

export type PairedBolster = {
  responseId: string;
  suggestedLength: string;
  measurements: { height_cm: number; sleep_position: BolsterSleepPosition };
  preferenceLines: Array<{ item_id: number; quantity: number; category: "case" }>;
  addonLines: Array<{ item_id: number; quantity: number }>;
  recommendationRecord?: Record<string, unknown>;
  assistFilling?: { placements: unknown[]; templateId: number | null };
};

/** The Mbolster as step 4 shows it, priced the way its own page priced it. */
export type PairedBolsterSummary = {
  label: string;
  /** Case and add-on names. */
  lines: string[];
  /** Goods and services; null when its page could not price them. */
  ballpark: number | null;
  currency: string;
};

/** Step 2's answer: the Mbolster to hold with the Mpillow, or none (Skip). */
export type PairedChoice =
  | { bolster: PairedBolster; summary: PairedBolsterSummary }
  | { bolster: null };

export type PairedHandoff = {
  v: 2;
  /** The Mpillow's Result id — the pair's anchor. */
  anchorId: string;
  /** The companion's Result id, minted once per anchor so a re-submit reuses it. */
  companionId: string;
  /** The pillow's answer, carried rather than asked again. */
  sleepPosition: BolsterSleepPosition;
  /** The fired route's reason, from the Rule graph. */
  reason: string;
  /** The Mpillow's configurator: where step 2 returns to. */
  configPath: string;
  /** The Mpillow as step 1 priced it, for step 2's running total. */
  pillow: { label: string; ballpark: number | null; currency: string };
  /** Step 2's own answers, kept so Back and forth does not lose them. */
  bolster?: {
    heightUnit?: string;
    heightCm?: string;
    caseId?: number | null;
    addonIds?: number[];
  };
  /** Step 2's answer, once given. Opening step 2 again clears it until re-answered. */
  choice?: PairedChoice;
};

/**
 * Whether this session runs the stepper. Only a shopper holding a card on the
 * configurator: an Assisted customisation is sent without a finish, a partner
 * run never sees upsells, and a reopened Result is past this decision.
 */
export function runsPairedStepper(opts: {
  routeTarget: RuleFlow | null | undefined;
  assisted: boolean;
  partnerAssisted: boolean;
  reopened: boolean;
}): boolean {
  return opts.routeTarget === "mbolster" && !opts.assisted && !opts.partnerAssisted && !opts.reopened;
}

/** The pillow's sleep position in the Mbolster flow's words. */
export function bolsterSleepPosition(pillow: string): BolsterSleepPosition {
  if (pillow === "side") return "side";
  if (pillow === "stomach") return "stomach";
  return "other";
}

/** Where step 2 sends the shopper once it is answered: the Mpillow page's step 3. */
export function pairedDetailsPath(configPath: string): string {
  return `${configPath}?paired=details`;
}

export function opensPairedDetails(search: string): boolean {
  return new URLSearchParams(search).get("paired") === "details";
}

function parsePairedChoice(raw: unknown, companionId: string): PairedChoice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as { bolster?: unknown; summary?: unknown };
  if (c.bolster === null) return { bolster: null };
  const b = c.bolster as Partial<PairedBolster> | undefined;
  // An answer for another companion belongs to another pair.
  if (!b || typeof b !== "object" || b.responseId !== companionId) return undefined;
  if (typeof b.suggestedLength !== "string" || !b.measurements) return undefined;
  if (!Array.isArray(b.preferenceLines) || !Array.isArray(b.addonLines)) return undefined;
  const s = (c.summary ?? {}) as Partial<PairedBolsterSummary>;
  return {
    bolster: b as PairedBolster,
    summary: {
      label: typeof s.label === "string" ? s.label : "Mbolster",
      lines: Array.isArray(s.lines) ? s.lines.filter((l): l is string => typeof l === "string") : [],
      ballpark: typeof s.ballpark === "number" ? s.ballpark : null,
      currency: typeof s.currency === "string" ? s.currency : "SGD",
    },
  };
}

export function parsePairedHandoff(raw: unknown): PairedHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Partial<PairedHandoff>;
  if (h.v !== 2) return null;
  if (typeof h.anchorId !== "string" || !h.anchorId) return null;
  if (typeof h.companionId !== "string" || !h.companionId) return null;
  if (typeof h.configPath !== "string" || !h.configPath.startsWith("/")) return null;
  if (h.sleepPosition !== "side" && h.sleepPosition !== "stomach" && h.sleepPosition !== "other") {
    return null;
  }
  const choice = parsePairedChoice(h.choice, h.companionId);
  return {
    v: 2,
    anchorId: h.anchorId,
    companionId: h.companionId,
    sleepPosition: h.sleepPosition,
    reason: typeof h.reason === "string" ? h.reason : "",
    configPath: h.configPath,
    pillow: {
      label: h.pillow?.label ?? "Mpillow",
      ballpark: typeof h.pillow?.ballpark === "number" ? h.pillow.ballpark : null,
      currency: h.pillow?.currency ?? "SGD",
    },
    ...(h.bolster && typeof h.bolster === "object" ? { bolster: h.bolster } : {}),
    ...(choice ? { choice } : {}),
  };
}

export function readPairedHandoff(storage: Pick<Storage, "getItem">): PairedHandoff | null {
  try {
    const raw = storage.getItem(PAIRED_HANDOFF_KEY);
    return raw ? parsePairedHandoff(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writePairedHandoff(storage: Pick<Storage, "setItem">, handoff: PairedHandoff): void {
  storage.setItem(PAIRED_HANDOFF_KEY, JSON.stringify(handoff));
}

export function clearPairedHandoff(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(PAIRED_HANDOFF_KEY);
}

/**
 * The hand-off moved onto the Mpillow's current Result. A cancelled Checkout
 * leaves the old pair held and the page carries on under a fresh id, so the
 * Mbolster needs a fresh id too — the hold would otherwise reach for a companion
 * that already belongs to the old anchor. Its answers are kept.
 */
export function reanchorPairedHandoff(
  handoff: PairedHandoff,
  anchorId: string,
  mintId: () => string,
): PairedHandoff {
  if (handoff.anchorId === anchorId) return handoff;
  const companionId = mintId();
  const choice = handoff.choice?.bolster
    ? { ...handoff.choice, bolster: { ...handoff.choice.bolster, responseId: companionId } }
    : handoff.choice;
  return { ...handoff, anchorId, companionId, ...(choice ? { choice } : {}) };
}

/**
 * The one hold request for both builds — the Mpillow's own body with its
 * Mbolster route answered — or, on Skip, the Mpillow alone with the route
 * declined. The route is answered here because this is where the shopper's
 * step 2 answer is sent.
 */
export function pairedHoldBody(
  pillowHold: Record<string, unknown>,
  bolster: PairedBolster | null,
): Record<string, unknown> {
  const record = parseRecommendationRecord(pillowHold.recommendationRecord ?? null);
  const journey = record?.flowRoute
    ? bolster
      ? withJourneyOnAccept(record, "mbolster")
      : withJourneyOnDecline(record)
    : record;
  return {
    ...pillowHold,
    ...(journey ? { recommendationRecord: journey } : {}),
    ...(bolster ? { pairedBolster: bolster } : {}),
  };
}
