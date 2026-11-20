import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export interface NextStepFacts {
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  lastDeliveredAt: string | null;
  reviewRequestedAt: string | null;
  reviewRequest: { enabled: boolean; daysAfter: number; maxAgeDays: number };
  checkup: { enabled: boolean; months: number };
  ownsPremium: boolean;
  lastReadjustedAt: string | null;
  readjustmentBooked: boolean;
  marketingEmail: MarketingEmailState;
  unengaged: boolean;
  overdueFollowUp: { title: string; dueOn: string } | null;
}

export type NextStepKind =
  | "followup_overdue"
  | "awaiting_delivery"
  | "review_request"
  | "checkup_due"
  | "at_risk_campaign"
  | "at_risk_unengaged"
  | "at_risk_call";

export interface NextStep {
  kind: NextStepKind;
  text: string;
  addFollowUp: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SGT_MS = 8 * 60 * 60 * 1000;

const sgtDate = (t: number) => new Date(t + SGT_MS).toISOString().slice(0, 10);

const plusDays = (ymd: string, days: number) => sgtDate(Date.parse(`${ymd}T00:00:00+08:00`) + days * DAY_MS);

function minusMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export const formatStepDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function nextStep(f: NextStepFacts, now: Date): NextStep | null {
  const today = sgtDate(now.getTime());

  if (f.overdueFollowUp && f.overdueFollowUp.dueOn < today) {
    return {
      kind: "followup_overdue",
      text: `Follow-up overdue: “${f.overdueFollowUp.title}”, due ${formatStepDate(f.overdueFollowUp.dueOn)}`,
      addFollowUp: false,
    };
  }

  if (f.detail === "awaiting_delivery") {
    return { kind: "awaiting_delivery", text: "Waiting on delivery", addFollowUp: false };
  }

  if (f.reviewRequest.enabled && !f.reviewRequestedAt && f.lastDeliveredAt) {
    const delivered = sgtDate(Date.parse(f.lastDeliveredAt));
    const from = plusDays(delivered, f.reviewRequest.daysAfter);
    const until = plusDays(delivered, f.reviewRequest.maxAgeDays);
    if (today <= until) {
      return {
        kind: "review_request",
        text: from <= today ? "Review request goes with the next daily run (automatic)" : `Review request goes on ${formatStepDate(from)} (automatic)`,
        addFollowUp: false,
      };
    }
  }

  if (f.checkup.enabled && f.ownsPremium && f.lastDeliveredAt && !f.readjustmentBooked) {
    const delivered = sgtDate(Date.parse(f.lastDeliveredAt));
    const dueFrom = minusMonths(today, f.checkup.months);
    const readjustedSince = f.lastReadjustedAt ? sgtDate(Date.parse(f.lastReadjustedAt)) > dueFrom : false;
    if (delivered <= dueFrom && !readjustedSince) {
      const span = f.checkup.months === 12 ? "a year" : `${f.checkup.months} months`;
      return { kind: "checkup_due", text: `Check-up due: no re-adjustment in ${span}`, addFollowUp: true };
    }
  }

  if (f.stage === "at_risk") {
    if (f.marketingEmail === "subscribed") {
      return f.unengaged
        ? { kind: "at_risk_unengaged", text: "Unengaged: only a win-back campaign reaches them. A personal call instead?", addFollowUp: true }
        : { kind: "at_risk_campaign", text: "At risk: the next campaign to At risk reaches them", addFollowUp: false };
    }
    return { kind: "at_risk_call", text: "At risk, not on marketing email: a personal call, not a campaign", addFollowUp: true };
  }

  return null;
}
