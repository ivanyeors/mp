import type { LifecycleDelivery, LifecycleStage } from "@/lib/crm/lifecycle-stage";

/**
 * The **Lifecycle stage** rule as a table (PRD-crm-retention-loop slice 03),
 * shared by lib/crm/__tests__/lifecycle-stage.test.ts (the TypeScript) and
 * lib/crm/lifecycle-stage.check.ts (the same rows through the SQL functions),
 * so the two are held to one answer, boundaries included.
 */

export interface LifecycleCase {
  name: string;
  now: string;
  /** Purchases here plus the Shopify-era count. */
  purchases: number;
  lastPurchaseAt: string | null;
  lastPurchaseDeliveredAt: string | null;
  stage: LifecycleStage;
  delivery: LifecycleDelivery | null;
  undated: boolean;
}

export const NOW = "2026-10-27T04:00:00.000Z";

/** `iso` moved by `seconds`. */
const shift = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

const LONG_DELIVERED = "2024-01-01T00:00:00.000Z";

export const LIFECYCLE_CASES: LifecycleCase[] = [
  { name: "no purchase", now: NOW, purchases: 0, lastPurchaseAt: null, lastPurchaseDeliveredAt: null, stage: "lead", delivery: null, undated: false },
  { name: "one purchase, not delivered", now: NOW, purchases: 1, lastPurchaseAt: "2026-10-20T09:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "new", delivery: "awaiting_delivery", undated: false },
  { name: "one purchase, delivered a week ago", now: NOW, purchases: 1, lastPurchaseAt: "2026-10-01T09:00:00.000Z", lastPurchaseDeliveredAt: "2026-10-20T04:00:00.000Z", stage: "new", delivery: "delivered", undated: false },
  { name: "delivered a second short of 30 days ago", now: NOW, purchases: 1, lastPurchaseAt: "2026-09-01T09:00:00.000Z", lastPurchaseDeliveredAt: shift("2026-09-27T04:00:00.000Z", 1), stage: "new", delivery: "delivered", undated: false },
  { name: "delivered exactly 30 days ago: settled", now: NOW, purchases: 1, lastPurchaseAt: "2026-09-01T09:00:00.000Z", lastPurchaseDeliveredAt: "2026-09-27T04:00:00.000Z", stage: "new", delivery: "settled", undated: false },
  { name: "two purchases", now: NOW, purchases: 2, lastPurchaseAt: "2026-06-01T00:00:00.000Z", lastPurchaseDeliveredAt: "2026-06-05T00:00:00.000Z", stage: "repeat", delivery: null, undated: false },
  { name: "three purchases", now: NOW, purchases: 3, lastPurchaseAt: "2026-06-01T00:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "loyal", delivery: null, undated: false },
  { name: "seven purchases", now: NOW, purchases: 7, lastPurchaseAt: "2026-01-01T00:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "loyal", delivery: null, undated: false },
  { name: "exactly 12 months ago: not yet at risk", now: NOW, purchases: 1, lastPurchaseAt: "2025-10-27T04:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "new", delivery: "settled", undated: false },
  { name: "a second over 12 months ago", now: NOW, purchases: 1, lastPurchaseAt: shift("2025-10-27T04:00:00.000Z", -1), lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk", delivery: null, undated: false },
  { name: "loyal, 13 months on: at risk", now: NOW, purchases: 4, lastPurchaseAt: "2025-09-27T04:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "at_risk", delivery: null, undated: false },
  { name: "exactly 24 months ago: still at risk", now: NOW, purchases: 2, lastPurchaseAt: "2024-10-27T04:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "at_risk", delivery: null, undated: false },
  { name: "a second over 24 months ago", now: NOW, purchases: 2, lastPurchaseAt: shift("2024-10-27T04:00:00.000Z", -1), lastPurchaseDeliveredAt: null, stage: "lapsed", delivery: null, undated: false },
  { name: "loyal, 30 months on: lapsed", now: NOW, purchases: 5, lastPurchaseAt: "2024-04-01T00:00:00.000Z", lastPurchaseDeliveredAt: null, stage: "lapsed", delivery: null, undated: false },
  // Postgres clamps the day: 31 March less 12 months is 31 March; 29 Feb 2028 less 12 is 28 Feb 2027.
  { name: "a month end, a year back", now: "2026-03-31T10:00:00.000Z", purchases: 1, lastPurchaseAt: "2025-03-30T10:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk", delivery: null, undated: false },
  { name: "29 February, on the clamped day", now: "2028-02-29T00:00:00.000Z", purchases: 1, lastPurchaseAt: "2027-02-28T00:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "new", delivery: "settled", undated: false },
  { name: "29 February, a second before the clamped day", now: "2028-02-29T00:00:00.000Z", purchases: 1, lastPurchaseAt: "2027-02-27T23:59:59.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk", delivery: null, undated: false },
  // Shopify-era orders only, until slice 09: placed by count, no dates.
  { name: "one Shopify-era order only", now: NOW, purchases: 1, lastPurchaseAt: null, lastPurchaseDeliveredAt: null, stage: "new", delivery: null, undated: true },
  { name: "two Shopify-era orders only", now: NOW, purchases: 2, lastPurchaseAt: null, lastPurchaseDeliveredAt: null, stage: "repeat", delivery: null, undated: true },
  { name: "nine Shopify-era orders only", now: NOW, purchases: 9, lastPurchaseAt: null, lastPurchaseDeliveredAt: null, stage: "loyal", delivery: null, undated: true },
];
