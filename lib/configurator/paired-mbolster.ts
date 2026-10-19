/**
 * The configurator's step 2 for a Paired build (ADR 0026): when the Mpillow's
 * Rule graph routes to Mbolster, the preview becomes "1 Mpillow · 2 Mbolster",
 * and step 2 may be skipped. Pure — the panel and the hold submit share these.
 */
import type { BolsterLength } from "@/lib/results/composed-sellable";
import type { RuleFlow } from "@/lib/rules-engine/types";
import type { ComponentOption } from "@/lib/types/customization";

/** What step 2 has collected so far; lifted so it survives Back to step 1. */
export type PairedMbolsterDraft = {
  /** The companion's Result id, minted once so a re-submit reuses it. */
  responseId: string;
  heightCm: string | null;
  length: BolsterLength | null;
  /** The Mbolster's shelf price for that length, shown beside the pillow's. */
  price: number | null;
  /** Cases cut for that length — Mbolster's only Customer preference. */
  cases: ComponentOption[];
  caseId: number | null;
  recommendationRecord: Record<string, unknown> | null;
};

export function newPairedMbolsterDraft(responseId: string): PairedMbolsterDraft {
  return {
    responseId,
    heightCm: null,
    length: null,
    price: null,
    cases: [],
    caseId: null,
    recommendationRecord: null,
  };
}

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

/** The hold's `pairedBolster`, or null until step 2 has a length and a case. */
export function pairedBolsterPayload(
  draft: PairedMbolsterDraft | null,
  sleepPosition: string,
): {
  responseId: string;
  suggestedLength: BolsterLength;
  measurements: { height_cm: number; sleep_position: string };
  preferenceLines: Array<{ item_id: number; quantity: number; category: "case" }>;
  recommendationRecord?: Record<string, unknown>;
} | null {
  if (!draft?.length || draft.caseId == null || draft.heightCm == null) return null;
  const heightCm = Number(draft.heightCm);
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;
  return {
    responseId: draft.responseId,
    suggestedLength: draft.length,
    measurements: { height_cm: heightCm, sleep_position: sleepPosition },
    preferenceLines: [{ item_id: draft.caseId, quantity: 1, category: "case" }],
    ...(draft.recommendationRecord ? { recommendationRecord: draft.recommendationRecord } : {}),
  };
}
