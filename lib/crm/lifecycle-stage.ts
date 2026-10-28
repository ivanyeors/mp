import { monthsBefore } from "@/lib/crm/months";

/**
 * The **Lifecycle stage** (PRD-crm-retention-loop slice 03; CONTEXT.md): where
 * a Customer is in the owner's funnel (owner decision 4, 2026-10-28),
 *
 *   Lead > New > Loyal > At risk > Lost
 *
 * with a sub-status inside some stages (*Loyal · Repeat purchases*, *At risk ·
 * Lapsed*). Derived from their purchases, attended Re-adjustment bookings and
 * marketing consent, and nothing else (never reviews, ratings, returns or
 * notes).
 *
 * A **purchase** is a counted Order with at least one goods line, so a
 * re-adjustment fee is never one; the booking it paid for, once attended, is
 * an **attended booking**. Until slice 09 imports Shopify-era Orders, a
 * Migrated customer's Shopify-era order count is added to their purchases,
 * with no dates: a Customer with no dated purchase here is placed by count and
 * `undated`, never *At risk*.
 *
 * The overview computes the stage in SQL, `customer_lifecycle_stage` and
 * `customer_lifecycle_detail` (migration 20261028090000), and these mirror
 * them: lib/crm/__tests__/lifecycle-stage-sql.test.ts holds the thresholds
 * equal, and lib/crm/lifecycle-stage.check.ts the answers, against a database.
 */

/** Every stage, in funnel order. */
export const LIFECYCLE_STAGES = ["lead", "new", "loyal", "at_risk", "lost"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * The sub-statuses: a *New* Customer's delivery, why a Customer is *Loyal*
 * (Renew's *subscriber* comes first once Renew exists), and *Lapsed* within
 * *At risk*.
 */
export const LIFECYCLE_DETAILS = [
  "awaiting_delivery",
  "delivered",
  "settled",
  "repeat_purchases",
  "bookings",
  "lapsed",
] as const;
export type LifecycleDetail = (typeof LIFECYCLE_DETAILS)[number];

/** Which stage each sub-status belongs to. */
export const LIFECYCLE_DETAIL_STAGE: Record<LifecycleDetail, LifecycleStage> = {
  awaiting_delivery: "new",
  delivered: "new",
  settled: "new",
  repeat_purchases: "loyal",
  bookings: "loyal",
  lapsed: "at_risk",
};

/** Owner, 2026-10-27: the yearly check-up falls due. */
export const AT_RISK_AFTER_MONTHS = 12;
/** Owner, 2026-10-27: Points expire (ADR 0030). */
export const LAPSED_AFTER_MONTHS = 24;
/** Owner, 2026-10-28: repeat purchases make a Customer *Loyal*, as one attended booking does. */
export const LOYAL_FROM_PURCHASES = 2;
/** The return window closes (ADR 0011), as Points release. */
export const SETTLED_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const LIFECYCLE_STAGE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  new: "New",
  loyal: "Loyal",
  at_risk: "At risk",
  lost: "Lost",
};

/** Each stage's rule, as Staff read it in a tooltip and on the filter. */
export const LIFECYCLE_STAGE_RULE: Record<LifecycleStage, string> = {
  lead: "No purchase or attended booking yet",
  new: "1 purchase",
  loyal: `${LOYAL_FROM_PURCHASES} or more purchases, or an attended re-adjustment booking`,
  at_risk: `No purchase or attended booking for over ${AT_RISK_AFTER_MONTHS} months (Lapsed over ${LAPSED_AFTER_MONTHS})`,
  lost: "Unsubscribed from marketing, with no purchase or attended booking since",
};

export const LIFECYCLE_DETAIL_LABEL: Record<LifecycleDetail, string> = {
  awaiting_delivery: "Awaiting delivery",
  delivered: "Delivered",
  settled: "Settled",
  repeat_purchases: "Repeat purchases",
  bookings: "Bookings",
  lapsed: "Lapsed",
};

/** What the stage is read from, as the overview's columns hold it. */
export interface LifecycleFacts {
  /** Purchases here, plus the Shopify-era count until slice 09. */
  purchases: number;
  /** The latest purchase here; null with none here. */
  lastPurchaseAt: string | null;
  /** Attended Re-adjustment bookings. */
  bookings: number;
  /** The latest attended booking's start; null with none. */
  lastBookingAt: string | null;
  /** When they unsubscribed from marketing email; null unless they are unsubscribed now. */
  unsubscribedAt: string | null;
}

/** The latest purchase or attended booking, in ms; null with neither dated. */
function lastActivity({ lastPurchaseAt, lastBookingAt }: LifecycleFacts): number | null {
  const times = [lastPurchaseAt, lastBookingAt].filter((t): t is string => t != null).map(Date.parse);
  return times.length ? Math.max(...times) : null;
}

/** The stage, checked in order: Lost, Lead, At risk, Loyal, New. Cut-offs are strict, as *Last order*'s. */
export function lifecycleStage(facts: LifecycleFacts, now: Date): LifecycleStage {
  const { purchases, bookings, unsubscribedAt } = facts;
  const last = lastActivity(facts);
  if (unsubscribedAt != null && !(last != null && last > Date.parse(unsubscribedAt))) return "lost";
  if (!(purchases > 0) && !(bookings > 0)) return "lead";
  if (!lifecycleUndated(facts) && last != null && last < monthsBefore(now, AT_RISK_AFTER_MONTHS).getTime()) return "at_risk";
  if (purchases >= LOYAL_FROM_PURCHASES || bookings > 0) return "loyal";
  return "new";
}

/**
 * The sub-status within the stage: a dated *New* Customer's delivery
 * (awaiting, delivered under 30 days ago, settled), *repeat purchases* or
 * *bookings* for *Loyal*, *lapsed* for *At risk* past 24 months. Null
 * otherwise, and for a *New* placed by the Shopify-era count, which has no
 * delivery here.
 */
export function lifecycleDetail(
  facts: LifecycleFacts & { lastPurchaseDeliveredAt: string | null },
  now: Date,
): LifecycleDetail | null {
  switch (lifecycleStage(facts, now)) {
    case "new":
      if (!facts.lastPurchaseAt) return null;
      if (!facts.lastPurchaseDeliveredAt) return "awaiting_delivery";
      return Date.parse(facts.lastPurchaseDeliveredAt) > now.getTime() - SETTLED_AFTER_DAYS * DAY_MS ? "delivered" : "settled";
    case "loyal":
      return facts.purchases >= LOYAL_FROM_PURCHASES ? "repeat_purchases" : "bookings";
    case "at_risk":
      return lastActivity(facts)! < monthsBefore(now, LAPSED_AFTER_MONTHS).getTime() ? "lapsed" : null;
    default:
      return null;
  }
}

/** Placed by the Shopify-era count alone: buyers whose dates are not here yet. */
export function lifecycleUndated({ purchases, lastPurchaseAt }: Pick<LifecycleFacts, "purchases" | "lastPurchaseAt">): boolean {
  return purchases > 0 && !lastPurchaseAt;
}
