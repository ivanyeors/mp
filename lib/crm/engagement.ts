import { monthsBefore } from "@/lib/crm/months";
import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";

export const UNENGAGED_AFTER_CAMPAIGNS = 6;
export const LEAD_UNENGAGED_AFTER_MONTHS = 12;

export const UNENGAGED_WHO = `clicked none of their last ${UNENGAGED_AFTER_CAMPAIGNS} campaign emails and are Lapsed (no purchase or visit for over 2 years) or a Lead for over ${LEAD_UNENGAGED_AFTER_MONTHS} months`;

export const UNENGAGED_RULE = `Clicked none of their last ${UNENGAGED_AFTER_CAMPAIGNS} campaign emails, and Lapsed (no purchase or visit for over 2 years) or a Lead for over ${LEAD_UNENGAGED_AFTER_MONTHS} months`;

export interface EngagementFacts {
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  customerSince: string;
  latestSent: number;
  latestClicked: number;
}

export function isUnengaged(f: EngagementFacts, now: Date): boolean {
  if (f.latestSent < UNENGAGED_AFTER_CAMPAIGNS || f.latestClicked !== 0) return false;
  if (f.stage === "at_risk" && f.detail === "lapsed") return true;
  if (f.stage !== "lead") return false;
  const since = Date.parse(f.customerSince);
  return Number.isFinite(since) && since < monthsBefore(now, LEAD_UNENGAGED_AFTER_MONTHS).getTime();
}

export function latestCampaignEngagement(clickedNewestFirst: readonly boolean[]): { latestSent: number; latestClicked: number } {
  const latest = clickedNewestFirst.slice(0, UNENGAGED_AFTER_CAMPAIGNS);
  return { latestSent: latest.length, latestClicked: latest.filter(Boolean).length };
}
