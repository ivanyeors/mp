import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";

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
  /** Attended Re-adjustment bookings. */
  bookings: number;
  lastBookingAt: string | null;
  unsubscribedAt: string | null;
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  undated: boolean;
}

export const NOW = "2026-10-27T04:00:00.000Z";

/** `iso` moved by `seconds`. */
const shift = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

const LONG_DELIVERED = "2024-01-01T00:00:00.000Z";

/** A row with nothing but what it names. */
const row = (c: Partial<LifecycleCase> & Pick<LifecycleCase, "name" | "stage">): LifecycleCase => ({
  now: NOW,
  purchases: 0,
  lastPurchaseAt: null,
  lastPurchaseDeliveredAt: null,
  bookings: 0,
  lastBookingAt: null,
  unsubscribedAt: null,
  detail: null,
  undated: false,
  ...c,
});

export const LIFECYCLE_CASES: LifecycleCase[] = [
  row({ name: "no purchase", stage: "lead" }),

  // New, and its delivery.
  row({ name: "one purchase, not delivered", purchases: 1, lastPurchaseAt: "2026-10-20T09:00:00.000Z", stage: "new", detail: "awaiting_delivery" }),
  row({ name: "one purchase, delivered a week ago", purchases: 1, lastPurchaseAt: "2026-10-01T09:00:00.000Z", lastPurchaseDeliveredAt: "2026-10-20T04:00:00.000Z", stage: "new", detail: "delivered" }),
  row({ name: "delivered a second short of 30 days ago", purchases: 1, lastPurchaseAt: "2026-09-01T09:00:00.000Z", lastPurchaseDeliveredAt: shift("2026-09-27T04:00:00.000Z", 1), stage: "new", detail: "delivered" }),
  row({ name: "delivered exactly 30 days ago: settled", purchases: 1, lastPurchaseAt: "2026-09-01T09:00:00.000Z", lastPurchaseDeliveredAt: "2026-09-27T04:00:00.000Z", stage: "new", detail: "settled" }),

  // Loyal: repeat purchases, or an attended booking.
  row({ name: "two purchases", purchases: 2, lastPurchaseAt: "2026-06-01T00:00:00.000Z", lastPurchaseDeliveredAt: "2026-06-05T00:00:00.000Z", stage: "loyal", detail: "repeat_purchases" }),
  row({ name: "seven purchases", purchases: 7, lastPurchaseAt: "2026-01-01T00:00:00.000Z", stage: "loyal", detail: "repeat_purchases" }),
  row({ name: "one purchase and an attended booking", purchases: 1, lastPurchaseAt: "2026-05-01T00:00:00.000Z", lastPurchaseDeliveredAt: "2026-05-04T00:00:00.000Z", bookings: 1, lastBookingAt: "2026-06-20T02:00:00.000Z", stage: "loyal", detail: "bookings" }),
  row({ name: "an attended booking and no purchase here", bookings: 1, lastBookingAt: "2026-09-10T02:00:00.000Z", stage: "loyal", detail: "bookings" }),
  row({ name: "two purchases and an attended booking: repeat purchases first", purchases: 2, lastPurchaseAt: "2026-03-01T00:00:00.000Z", bookings: 2, lastBookingAt: "2026-08-01T00:00:00.000Z", stage: "loyal", detail: "repeat_purchases" }),

  // At risk, and Lapsed within it. A booking restarts the clock as a purchase does.
  row({ name: "exactly 12 months ago: not yet at risk", purchases: 1, lastPurchaseAt: "2025-10-27T04:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "new", detail: "settled" }),
  row({ name: "a second over 12 months ago", purchases: 1, lastPurchaseAt: shift("2025-10-27T04:00:00.000Z", -1), lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk" }),
  row({ name: "a purchase 13 months ago, a booking 3 months ago", purchases: 1, lastPurchaseAt: "2025-09-27T04:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, bookings: 1, lastBookingAt: "2026-07-27T04:00:00.000Z", stage: "loyal", detail: "bookings" }),
  row({ name: "a booking a second over 12 months ago, no purchase here", bookings: 1, lastBookingAt: shift("2025-10-27T04:00:00.000Z", -1), stage: "at_risk" }),
  row({ name: "repeat purchases, 13 months on: at risk", purchases: 4, lastPurchaseAt: "2025-09-27T04:00:00.000Z", stage: "at_risk" }),
  row({ name: "exactly 24 months ago: not yet lapsed", purchases: 2, lastPurchaseAt: "2024-10-27T04:00:00.000Z", stage: "at_risk" }),
  row({ name: "a second over 24 months ago: lapsed", purchases: 2, lastPurchaseAt: shift("2024-10-27T04:00:00.000Z", -1), stage: "at_risk", detail: "lapsed" }),
  row({ name: "a purchase 30 months ago, a booking 20 months ago: at risk, not lapsed", purchases: 1, lastPurchaseAt: "2024-04-01T00:00:00.000Z", bookings: 1, lastBookingAt: "2025-02-27T00:00:00.000Z", stage: "at_risk" }),
  row({ name: "a booking 30 months ago only: lapsed", bookings: 3, lastBookingAt: "2024-04-01T00:00:00.000Z", stage: "at_risk", detail: "lapsed" }),
  // Postgres clamps the day: 31 March less 12 months is 31 March; 29 Feb 2028 less 12 is 28 Feb 2027, less 24 is 28 Feb 2026.
  row({ name: "a month end, a year back", now: "2026-03-31T10:00:00.000Z", purchases: 1, lastPurchaseAt: "2025-03-30T10:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk" }),
  row({ name: "29 February, on the clamped day", now: "2028-02-29T00:00:00.000Z", purchases: 1, lastPurchaseAt: "2027-02-28T00:00:00.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "new", detail: "settled" }),
  row({ name: "29 February, a second before the clamped day", now: "2028-02-29T00:00:00.000Z", purchases: 1, lastPurchaseAt: "2027-02-27T23:59:59.000Z", lastPurchaseDeliveredAt: LONG_DELIVERED, stage: "at_risk" }),
  row({ name: "29 February, two years back on the clamped day: not yet lapsed", now: "2028-02-29T00:00:00.000Z", purchases: 2, lastPurchaseAt: "2026-02-28T00:00:00.000Z", stage: "at_risk" }),
  row({ name: "29 February, two years back and a second: lapsed", now: "2028-02-29T00:00:00.000Z", purchases: 2, lastPurchaseAt: "2026-02-27T23:59:59.000Z", stage: "at_risk", detail: "lapsed" }),

  // Shopify-era orders only, until slice 09: placed by count, no dates, never at risk.
  row({ name: "one Shopify-era order only", purchases: 1, stage: "new", undated: true }),
  row({ name: "two Shopify-era orders only", purchases: 2, stage: "loyal", detail: "repeat_purchases", undated: true }),
  row({ name: "nine Shopify-era orders only", purchases: 9, stage: "loyal", detail: "repeat_purchases", undated: true }),
  row({ name: "one Shopify-era order and a booking 30 months ago", purchases: 1, bookings: 1, lastBookingAt: "2024-04-01T00:00:00.000Z", stage: "loyal", detail: "bookings", undated: true }),

  // Lost: unsubscribed, and nothing since. It comes before every other stage.
  row({ name: "a Lead who unsubscribed", unsubscribedAt: "2026-10-01T00:00:00.000Z", stage: "lost" }),
  row({ name: "unsubscribed after their one purchase", purchases: 1, lastPurchaseAt: "2026-08-01T00:00:00.000Z", lastPurchaseDeliveredAt: "2026-08-05T00:00:00.000Z", unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "lost" }),
  row({ name: "unsubscribed with repeat purchases", purchases: 3, lastPurchaseAt: "2026-08-01T00:00:00.000Z", unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "lost" }),
  row({ name: "unsubscribed while at risk", purchases: 1, lastPurchaseAt: "2025-02-01T00:00:00.000Z", unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "lost" }),
  row({ name: "unsubscribed with Shopify-era orders only", purchases: 2, unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "lost", undated: true }),
  row({ name: "a purchase in the same second as the unsubscribe", purchases: 1, lastPurchaseAt: "2026-09-01T00:00:00.000Z", unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "lost" }),
  row({ name: "bought a second after unsubscribing: out of Lost", purchases: 1, lastPurchaseAt: shift("2026-09-01T00:00:00.000Z", 1), unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "new", detail: "awaiting_delivery" }),
  row({ name: "attended a booking after unsubscribing: out of Lost", purchases: 1, lastPurchaseAt: "2026-05-01T00:00:00.000Z", bookings: 1, lastBookingAt: "2026-10-10T00:00:00.000Z", unsubscribedAt: "2026-09-01T00:00:00.000Z", stage: "loyal", detail: "bookings" }),
  row({ name: "bought after unsubscribing, then silent 30 months: lapsed, not lost", purchases: 1, lastPurchaseAt: "2024-04-01T00:00:00.000Z", unsubscribedAt: "2024-03-01T00:00:00.000Z", stage: "at_risk", detail: "lapsed" }),
];
