/**
 * The Paired build stepper (ADR 0026). When the Mpillow's Rule graph routes to
 * Mbolster, the preview becomes "1 Mpillow · 2 Mbolster (optional)". Step 2 is
 * the Mbolster configurator itself, in paired mode: it asks only for height,
 * then shows its own preview — case, add-ons, and the Staff x-ray editor — and
 * holds both builds in one request. Pure; both configurators share these.
 */
import { parseRecommendationRecord } from "@/lib/rules-engine/recommendation-record";
import { withJourneyOnAccept, withJourneyOnDecline } from "@/lib/rules-engine/journey";
import type { RuleFlow } from "@/lib/rules-engine/types";

/** sessionStorage: the Mpillow's finished hold, handed to the Mbolster page. */
export const PAIRED_HANDOFF_KEY = "mp_paired_build_handoff";

export type BolsterSleepPosition = "side" | "stomach" | "other";

export type PairedHandoff = {
  v: 1;
  /** The Mpillow's hold body, exactly as its own Proceed would send it. */
  pillowHold: Record<string, unknown>;
  /** The companion's Result id, minted once so a re-submit reuses it. */
  companionId: string;
  /** The pillow's answer, carried rather than asked again. */
  sleepPosition: BolsterSleepPosition;
  /** The fired route's reason, from the Rule graph. */
  reason: string;
  /** The Mpillow's configurator: where Back returns, and Stripe's cancel too. */
  configPath: string;
  pillow: { label: string; ballpark: number | null; currency: string };
  /** Step 2's own answers, kept so Back and forth does not lose them. */
  bolster?: {
    heightUnit?: string;
    heightCm?: string;
    caseId?: number | null;
    addonIds?: number[];
  };
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

export function parsePairedHandoff(raw: unknown): PairedHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Partial<PairedHandoff>;
  if (h.v !== 1) return null;
  if (!h.pillowHold || typeof h.pillowHold !== "object") return null;
  if (typeof h.companionId !== "string" || !h.companionId) return null;
  if (typeof h.configPath !== "string" || !h.configPath.startsWith("/")) return null;
  if (h.sleepPosition !== "side" && h.sleepPosition !== "stomach" && h.sleepPosition !== "other") {
    return null;
  }
  return {
    v: 1,
    pillowHold: h.pillowHold,
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

export type PairedBolster = {
  responseId: string;
  suggestedLength: string;
  measurements: { height_cm: number; sleep_position: BolsterSleepPosition };
  preferenceLines: Array<{ item_id: number; quantity: number; category: "case" }>;
  addonLines: Array<{ item_id: number; quantity: number }>;
  recommendationRecord?: Record<string, unknown>;
  assistFilling?: { placements: unknown[]; templateId: number | null };
};

/**
 * The one hold request for both builds — the Mpillow's own body with its
 * Mbolster route answered — or, on Skip, the Mpillow alone with the route
 * declined. The route is answered here because this is where the shopper
 * answers it.
 */
export function pairedHoldBody(
  handoff: PairedHandoff,
  bolster: PairedBolster | null,
): Record<string, unknown> {
  const record = parseRecommendationRecord(handoff.pillowHold.recommendationRecord ?? null);
  const journey = record?.flowRoute
    ? bolster
      ? withJourneyOnAccept(record, "mbolster")
      : withJourneyOnDecline(record)
    : record;
  return {
    ...handoff.pillowHold,
    ...(journey ? { recommendationRecord: journey } : {}),
    ...(bolster ? { pairedBolster: bolster } : {}),
  };
}
