import { monthsBefore } from "@/lib/crm/months";

export const LIFECYCLE_STAGES = ["lead", "new", "loyal", "at_risk", "lost"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_DETAILS = [
  "awaiting_delivery",
  "delivered",
  "settled",
  "repeat_purchases",
  "bookings",
  "lapsed",
] as const;
export type LifecycleDetail = (typeof LIFECYCLE_DETAILS)[number];

export const LIFECYCLE_DETAIL_STAGE: Record<LifecycleDetail, LifecycleStage> = {
  awaiting_delivery: "new",
  delivered: "new",
  settled: "new",
  repeat_purchases: "loyal",
  bookings: "loyal",
  lapsed: "at_risk",
};

export const AT_RISK_AFTER_MONTHS = 12;
export const LAPSED_AFTER_MONTHS = 24;
export const LOYAL_FROM_PURCHASES = 2;
export const SETTLED_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const LIFECYCLE_STAGE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  new: "New",
  loyal: "Loyal",
  at_risk: "At risk",
  lost: "Lost",
};

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

export const LIFECYCLE_DETAIL_RULE: Record<LifecycleDetail, string> = {
  awaiting_delivery: "Their purchase is on its way",
  delivered: `Delivered under ${SETTLED_AFTER_DAYS} days ago`,
  settled: `Delivered ${SETTLED_AFTER_DAYS} days ago or more`,
  repeat_purchases: `${LOYAL_FROM_PURCHASES} or more purchases`,
  bookings: "An attended re-adjustment booking",
  lapsed: `Over ${LAPSED_AFTER_MONTHS} months`,
};

export interface LifecycleFacts {
  purchases: number;
  lastPurchaseAt: string | null;
  bookings: number;
  lastBookingAt: string | null;
  unsubscribedAt: string | null;
}

function lastActivity({ lastPurchaseAt, lastBookingAt }: LifecycleFacts): number | null {
  const times = [lastPurchaseAt, lastBookingAt].filter((t): t is string => t != null).map(Date.parse);
  return times.length ? Math.max(...times) : null;
}

export function lifecycleStage(facts: LifecycleFacts, now: Date): LifecycleStage {
  const { purchases, bookings, unsubscribedAt } = facts;
  const last = lastActivity(facts);
  if (unsubscribedAt != null && !(last != null && last > Date.parse(unsubscribedAt))) return "lost";
  if (!(purchases > 0) && !(bookings > 0)) return "lead";
  if (!lifecycleUndated(facts) && last != null && last < monthsBefore(now, AT_RISK_AFTER_MONTHS).getTime()) return "at_risk";
  if (purchases >= LOYAL_FROM_PURCHASES || bookings > 0) return "loyal";
  return "new";
}

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

export function latestPurchase(facts: {
  hereAt: string | null;
  hereDeliveredAt: string | null;
  shopifyOrders: number | null;
  lastFittedAt: string | null;
}): { at: string | null; deliveredAt: string | null; datedByFitting: boolean } {
  const fitted = (facts.shopifyOrders ?? 0) > 0 ? facts.lastFittedAt : null;
  const datedByFitting = fitted != null && (facts.hereAt == null || Date.parse(fitted) > Date.parse(facts.hereAt));
  return datedByFitting
    ? { at: fitted, deliveredAt: fitted, datedByFitting }
    : { at: facts.hereAt, deliveredAt: facts.hereDeliveredAt, datedByFitting };
}

export function lifecycleUndated({ purchases, lastPurchaseAt }: Pick<LifecycleFacts, "purchases" | "lastPurchaseAt">): boolean {
  return purchases > 0 && !lastPurchaseAt;
}
