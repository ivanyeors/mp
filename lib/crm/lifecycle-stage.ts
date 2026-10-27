import { monthsBefore } from "@/lib/crm/months";

/**
 * The **Lifecycle stage** (PRD-crm-retention-loop slice 03; CONTEXT.md): one
 * word for where a Customer is in the loop, derived from their purchases and
 * nothing else (never reviews, ratings, returns or notes).
 *
 * A **purchase** is a counted Order with at least one goods line, so a
 * re-adjustment fee is never one. Until slice 09 imports Shopify-era Orders, a
 * Migrated customer's Shopify-era order count is added to their purchases,
 * with no dates: such a Customer is placed by count and `undated`, never *At
 * risk* or *Lapsed*.
 *
 * The overview computes the stage in SQL, `customer_lifecycle_stage` and
 * `customer_lifecycle_delivery` (migration 20261027150402), and these mirror
 * them: lib/crm/__tests__/lifecycle-stage-sql.test.ts holds the thresholds
 * equal, and lib/crm/lifecycle-stage.check.ts the answers, against a database.
 */

/** Every stage, in the order a Customer moves through them. */
export const LIFECYCLE_STAGES = ["lead", "new", "repeat", "loyal", "at_risk", "lapsed"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** A *New* Customer's one purchase, on its way to them. */
export const LIFECYCLE_DELIVERIES = ["awaiting_delivery", "delivered", "settled"] as const;
export type LifecycleDelivery = (typeof LIFECYCLE_DELIVERIES)[number];

/** Owner, 2026-10-27: the yearly check-up falls due. */
export const AT_RISK_AFTER_MONTHS = 12;
/** Owner, 2026-10-27: Points expire (ADR 0030). */
export const LAPSED_AFTER_MONTHS = 24;
export const LOYAL_FROM_PURCHASES = 3;
/** The return window closes (ADR 0011), as Points release. */
export const SETTLED_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const LIFECYCLE_STAGE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  new: "New",
  repeat: "Repeat",
  loyal: "Loyal",
  at_risk: "At risk",
  lapsed: "Lapsed",
};

/** Each stage's rule, as Staff read it in a tooltip and on the filter. */
export const LIFECYCLE_STAGE_RULE: Record<LifecycleStage, string> = {
  lead: "No purchase yet",
  new: "1 purchase",
  repeat: "2 purchases",
  loyal: `${LOYAL_FROM_PURCHASES} or more purchases`,
  at_risk: `Last purchase ${AT_RISK_AFTER_MONTHS} to ${LAPSED_AFTER_MONTHS} months ago`,
  lapsed: `Last purchase over ${LAPSED_AFTER_MONTHS} months ago`,
};

export const LIFECYCLE_DELIVERY_LABEL: Record<LifecycleDelivery, string> = {
  awaiting_delivery: "Awaiting delivery",
  delivered: "Delivered",
  settled: "Settled",
};

/** What the stage is read from, as the overview's columns hold it. */
export interface LifecycleFacts {
  /** Purchases here, plus the Shopify-era count until slice 09. */
  purchases: number;
  /** The latest purchase here; null with none here. */
  lastPurchaseAt: string | null;
}

/** The stage, checked in order: Lapsed, At risk, Loyal, Repeat, New, Lead. Cut-offs are strict, as *Last order*'s. */
export function lifecycleStage({ purchases, lastPurchaseAt }: LifecycleFacts, now: Date): LifecycleStage {
  if (!(purchases > 0)) return "lead";
  if (lastPurchaseAt) {
    const at = Date.parse(lastPurchaseAt);
    if (at < monthsBefore(now, LAPSED_AFTER_MONTHS).getTime()) return "lapsed";
    if (at < monthsBefore(now, AT_RISK_AFTER_MONTHS).getTime()) return "at_risk";
  }
  if (purchases >= LOYAL_FROM_PURCHASES) return "loyal";
  if (purchases === 2) return "repeat";
  return "new";
}

/**
 * A dated *New* Customer's one purchase: awaiting delivery, delivered (under
 * 30 days ago) or settled. Null for every other stage, and for a *New* placed
 * by the Shopify-era count, which has no delivery here.
 */
export function lifecycleDelivery(
  facts: LifecycleFacts & { lastPurchaseDeliveredAt: string | null },
  now: Date,
): LifecycleDelivery | null {
  if (!facts.lastPurchaseAt || lifecycleStage(facts, now) !== "new") return null;
  if (!facts.lastPurchaseDeliveredAt) return "awaiting_delivery";
  return Date.parse(facts.lastPurchaseDeliveredAt) > now.getTime() - SETTLED_AFTER_DAYS * DAY_MS ? "delivered" : "settled";
}

/** Placed by the Shopify-era count alone: buyers whose dates are not here yet. */
export function lifecycleUndated({ purchases, lastPurchaseAt }: LifecycleFacts): boolean {
  return purchases > 0 && !lastPurchaseAt;
}
