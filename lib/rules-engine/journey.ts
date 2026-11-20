import type { RecommendationRecord } from "./recommendation-record";
import type { FlowRouteDecision, RuleFlow } from "./types";

export type { FlowRouteDecision };

export type PreStripeRouteGate =
  | RecommendationRecord
  | {
      flowRoute: RecommendationRecord["flowRoute"];
      flowRouteDecision?: FlowRouteDecision | null;
    };

export function isFlowRoutePending(record: RecommendationRecord): boolean {
  if (!record.flowRoute) return false;
  const d = record.flowRouteDecision;
  return d !== "accepted" && d !== "declined";
}

export function withJourneyOnDecline(
  record: RecommendationRecord,
): RecommendationRecord {
  return {
    ...record,
    finalFlow: record.flow,
    flowRouteDecision: "declined",
  };
}

export function withJourneyOnAccept(
  record: RecommendationRecord,
  targetFlow: RuleFlow,
): RecommendationRecord {
  return {
    ...record,
    finalFlow: targetFlow,
    flowRouteDecision: "accepted",
  };
}

export function assertPreStripeRouteResolved(
  gate: PreStripeRouteGate,
): { ok: true } | { ok: false; reason: string } {
  if (!gate.flowRoute) return { ok: true };
  const decision = gate.flowRouteDecision ?? null;
  if (decision === "accepted" || decision === "declined") return { ok: true };
  return {
    ok: false,
    reason: "Flow route upsell awaiting shopper decision before Stripe hold",
  };
}

export function stampAcceptedTargetRecord(
  entry: RecommendationRecord,
  target: RecommendationRecord,
): RecommendationRecord {
  return {
    ...target,
    entryFlow: entry.entryFlow,
    flowRoute: entry.flowRoute,
    flowRouteDecision: "accepted",
    finalFlow: target.flow,
  };
}
