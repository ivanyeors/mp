import { parseRecommendationRecord } from "@/lib/rules-engine/recommendation-record";
import { withJourneyOnAccept, withJourneyOnDecline } from "@/lib/rules-engine/journey";
import type { RuleFlow } from "@/lib/rules-engine/types";
import {
  parseBolsterAssistDraft,
  type BolsterAssistDraft,
} from "@/lib/configurator/staff-assist-draft";

export const PAIRED_HANDOFF_KEY = "mp_paired_build_handoff";

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

export type PairedBolsterSummary = {
  label: string;
  lines: string[];
  ballpark: number | null;
  currency: string;
};

export type PairedPillowSummary = {
  label: string;
  ballpark: number | null;
  currency: string;
  goods?: number | null;
  services?: Array<{ label: string; amount: number }>;
};

export type PairedBolsterAnswers = {
  heightUnit?: string;
  heightCm?: string;
  caseId?: number | null;
  addonIds?: number[];
  assist?: BolsterAssistDraft;
};

export type PairedChoice =
  | { bolster: PairedBolster; summary: PairedBolsterSummary }
  | { bolster: null };

export type PairedHandoff = {
  v: 2;
  anchorId: string;
  companionId: string;
  sleepPosition: BolsterSleepPosition;
  reason: string;
  configPath: string;
  pillow: PairedPillowSummary;
  bolster?: PairedBolsterAnswers;
  choice?: PairedChoice;
};

export function runsPairedStepper(opts: {
  routeTarget: RuleFlow | null | undefined;
  assisted: boolean;
  partnerAssisted: boolean;
  reopened: boolean;
}): boolean {
  return opts.routeTarget === "mbolster" && !opts.assisted && !opts.partnerAssisted && !opts.reopened;
}

export function bolsterSleepPosition(pillow: string): BolsterSleepPosition {
  if (pillow === "side") return "side";
  if (pillow === "stomach") return "stomach";
  return "other";
}

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

function parseBolsterAnswers(raw: object): PairedBolsterAnswers {
  const { assist, ...answers } = raw as PairedBolsterAnswers;
  const parsed = parseBolsterAssistDraft(assist);
  return { ...answers, ...(parsed ? { assist: parsed } : {}) };
}

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePairedPillow(raw: Partial<PairedPillowSummary> | undefined): PairedPillowSummary {
  const pillow: PairedPillowSummary = {
    label: typeof raw?.label === "string" ? raw.label : "Mpillow",
    ballpark: isAmount(raw?.ballpark) ? raw.ballpark : null,
    currency: typeof raw?.currency === "string" ? raw.currency : "SGD",
  };
  if (isAmount(raw?.goods)) pillow.goods = raw.goods;
  if (Array.isArray(raw?.services)) {
    pillow.services = raw.services.filter(
      (s): s is { label: string; amount: number } =>
        Boolean(s) && typeof s.label === "string" && isAmount(s.amount),
    );
  }
  return pillow;
}

export function pairedPillowRows(
  pillow: PairedPillowSummary,
): Array<{ key: string; label: string; amount: number | null }> {
  const whole = [{ key: "pillow", label: pillow.label, amount: pillow.ballpark }];
  const services = pillow.services ?? [];
  if (pillow.ballpark == null || pillow.goods == null || services.length === 0) return whole;
  const sum = services.reduce((s, l) => s + l.amount, pillow.goods);
  if (Math.abs(sum - pillow.ballpark) >= 0.005) return whole;
  return [
    { key: "pillow", label: pillow.label, amount: pillow.goods },
    ...services.map((s, i) => ({ key: `service-${i}`, label: s.label, amount: s.amount })),
  ];
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
    pillow: parsePairedPillow(h.pillow),
    ...(h.bolster && typeof h.bolster === "object" ? { bolster: parseBolsterAnswers(h.bolster) } : {}),
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
