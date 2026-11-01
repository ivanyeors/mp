import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

/**
 * The next step on a Customer (PRD-crm-retention-loop slice 05): what Staff
 * do now, read from facts the Customer page already has. One step, or none.
 * Pure: `readNextStepFacts` (./next-step-server) reads the facts.
 *
 * First match wins:
 *  1. an open Follow-up past its due date;
 *  2. a purchase paid and not delivered yet;
 *  3. the Review request still to go: it is automatic, so this only says when
 *     (nothing to press, and never a prompt to ask for one);
 *  4. the yearly check-up due for a Premium Mpillow with no re-adjustment
 *     since, nor one booked: *Add a follow-up*;
 *  5. *At risk* and subscribed: the next *At risk* campaign reaches them, unless
 *     they are Unengaged, when only a win-back does;
 *  6. *At risk* and not subscribed: a personal call, not marketing.
 *
 * The PRD's seventh step, points about to expire, is gone: points never
 * expire (ADR 0030 decision 17, 2026-10-31). No step suggests asking for a
 * review or offers a discount.
 */

export interface NextStepFacts {
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  /** The latest purchase's delivery; null while on its way, or with none here. */
  lastDeliveredAt: string | null;
  /** When their Review request went, by either channel; null if never. */
  reviewRequestedAt: string | null;
  /** The aftercare settings: on or off, and their timing. */
  reviewRequest: { enabled: boolean; daysAfter: number; maxAgeDays: number };
  checkup: { enabled: boolean; months: number };
  /** A Premium Mpillow on a counted Order: what the check-up is for. */
  ownsPremium: boolean;
  /** The latest attended re-adjustment; null if none. */
  lastReadjustedAt: string | null;
  /** A re-adjustment booked and still to come. */
  readjustmentBooked: boolean;
  marketingEmail: MarketingEmailState;
  /** PRD-campaign-audiences slice 12. */
  unengaged: boolean;
  /** Their earliest open Follow-up past its due date (a Singapore date, YYYY-MM-DD). */
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
  /** The line, in words. */
  text: string;
  /** Whether the line offers *Add a follow-up*. */
  addFollowUp: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SGT_MS = 8 * 60 * 60 * 1000;

/** A Singapore calendar date, YYYY-MM-DD. */
const sgtDate = (t: number) => new Date(t + SGT_MS).toISOString().slice(0, 10);

/** `ymd` plus `days` calendar days. */
const plusDays = (ymd: string, days: number) => sgtDate(Date.parse(`${ymd}T00:00:00+08:00`) + days * DAY_MS);

/** YYYY-MM-DD less `months` calendar months, the day clamped to the month's end, as the check-up counts. */
function minusMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** *4 Nov 2026*. */
export const formatStepDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Pure — the one next step for a Customer at `now`, or null when nothing is due. */
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
