import type {
  EvaluateResult,
  FiredTerminal,
  FlowRouteDecision,
  RuleFlow,
  SizeOrLength,
  TraceStep,
} from "./types";

export type RecommendationRecord = {
  graphVersionId: string | null;
  flow: RuleFlow;
  entryFlow: RuleFlow;
  finalFlow: RuleFlow;
  size: SizeOrLength | null;
  templateId: string | null;
  tierSuggestion: "basic" | "premium" | null;
  soldTier: "basic" | "premium" | null;
  flowRoute: EvaluateResult["flowRoute"];
  flowRouteDecision: FlowRouteDecision | null;
  firedTerminals: FiredTerminal[];
  trace: TraceStep[];
  usedFallback: boolean;
  usedLegacyBootstrap: boolean;
};

export function recordFromEvaluate(
  flow: RuleFlow,
  graphVersionId: string,
  result: EvaluateResult,
  soldTier: "basic" | "premium" | null,
): RecommendationRecord {
  return {
    graphVersionId,
    flow,
    entryFlow: flow,
    finalFlow: flow,
    size: result.size,
    templateId: result.templateId,
    tierSuggestion: result.tierSuggestion,
    soldTier,
    flowRoute: result.flowRoute,
    flowRouteDecision: result.flowRoute ? "pending" : null,
    firedTerminals: result.firedTerminals,
    trace: result.trace,
    usedFallback: result.usedFallback,
    usedLegacyBootstrap: false,
  };
}

export function legacyBootstrapRecord(
  flow: RuleFlow,
  size: SizeOrLength | null,
  soldTier: "basic" | "premium" | null,
  tierSuggestion: "basic" | "premium" | null = soldTier,
): RecommendationRecord {
  return {
    graphVersionId: null,
    flow,
    entryFlow: flow,
    finalFlow: flow,
    size,
    templateId: null,
    tierSuggestion,
    soldTier,
    flowRoute: null,
    flowRouteDecision: null,
    firedTerminals: [],
    trace: [],
    usedFallback: false,
    usedLegacyBootstrap: true,
  };
}

export function toPersistedRecommendationRecord(
  record: RecommendationRecord,
): Record<string, unknown> {
  return { ...record };
}

export function parseRecommendationRecord(
  raw: unknown,
): RecommendationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<RecommendationRecord>;
  if (!o.flow || !("size" in o)) return null;
  return o as RecommendationRecord;
}
