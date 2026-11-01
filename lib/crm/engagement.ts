import { monthsBefore } from "@/lib/crm/months";
import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";

/**
 * **Unengaged** (PRD-campaign-audiences slice 12; owner decision 4,
 * 2026-10-31): the sunset rule, read from the **Lifecycle stage**. Someone who
 * stopped buying long ago and never clicks stops getting campaigns before they
 * mark one as spam.
 *
 * A Customer is Unengaged when they clicked none of their latest
 * {@link UNENGAGED_AFTER_CAMPAIGNS} campaign emails and either
 *   - they are *At risk · Lapsed* (no purchase or attended booking for over
 *     24 months), or
 *   - they are a *Lead* who has been a Customer here for over
 *     {@link LEAD_UNENGAGED_AFTER_MONTHS} months.
 * *New*, *Loyal* and *At risk* under 24 months never are; *Lost* is already out
 * (unsubscribed). Fewer than 6 campaigns sent is never Unengaged.
 *
 * Unengaged is a sending choice, never a stage and never consent: campaigns
 * leave the Unengaged out unless one ticks *Include unengaged* (a win-back).
 *
 * The overview computes it in SQL, `customer_unengaged` (migration
 * 20261101081436), as `admin_customer_overview.unengaged`; the Customers list's
 * *Engagement* filter and the campaign rule both read that column. This is its
 * twin: lib/crm/__tests__/engagement-sql.test.ts holds the constants equal,
 * and campaign-rule-cases.json the answers.
 */

/** Campaign emails, latest first, of which they clicked none. */
export const UNENGAGED_AFTER_CAMPAIGNS = 6;
/** How long a Lead has been a Customer before they can be Unengaged. */
export const LEAD_UNENGAGED_AFTER_MONTHS = 12;

/** Who is Unengaged, in words that follow "people who": the campaign's *Include unengaged* hint. */
export const UNENGAGED_WHO = `clicked none of their last ${UNENGAGED_AFTER_CAMPAIGNS} campaign emails and are Lapsed (no purchase or visit for over 2 years) or a Lead for over ${LEAD_UNENGAGED_AFTER_MONTHS} months`;

/** The rule in words, for the *Engagement* filter's hint and the Customer's badge. */
export const UNENGAGED_RULE = `Clicked none of their last ${UNENGAGED_AFTER_CAMPAIGNS} campaign emails, and Lapsed (no purchase or visit for over 2 years) or a Lead for over ${LEAD_UNENGAGED_AFTER_MONTHS} months`;

export interface EngagementFacts {
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  /** When they became a Customer here (`customers.created_at`). */
  customerSince: string;
  /** Of their latest 6 campaign emails the provider accepted, how many there are (0 to 6). */
  latestSent: number;
  /** And how many of those they clicked. */
  latestClicked: number;
}

/** Pure — the twin of `customer_unengaged()`. Cut-offs are strict, as the stage's. */
export function isUnengaged(f: EngagementFacts, now: Date): boolean {
  if (f.latestSent < UNENGAGED_AFTER_CAMPAIGNS || f.latestClicked !== 0) return false;
  if (f.stage === "at_risk" && f.detail === "lapsed") return true;
  if (f.stage !== "lead") return false;
  const since = Date.parse(f.customerSince);
  return Number.isFinite(since) && since < monthsBefore(now, LEAD_UNENGAGED_AFTER_MONTHS).getTime();
}

/**
 * Pure — their latest campaign emails, newest first, as `latestSent` and
 * `latestClicked`: only the latest {@link UNENGAGED_AFTER_CAMPAIGNS} count.
 */
export function latestCampaignEngagement(clickedNewestFirst: readonly boolean[]): { latestSent: number; latestClicked: number } {
  const latest = clickedNewestFirst.slice(0, UNENGAGED_AFTER_CAMPAIGNS);
  return { latestSent: latest.length, latestClicked: latest.filter(Boolean).length };
}
