import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_DETAIL_LABEL,
  LIFECYCLE_DETAIL_STAGE,
  LIFECYCLE_DETAILS,
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABEL,
  LIFECYCLE_STAGE_RULE,
  lifecycleDetail,
  lifecycleStage,
  lifecycleUndated,
  latestPurchase,
} from "@/lib/crm/lifecycle-stage";
import { LIFECYCLE_CASES, NOW } from "./lifecycle-stage-cases";

/**
 * PRD-crm-retention-loop slice 03: the Lifecycle stage. Owner, 2026-10-28:
 * Lead > New > Loyal (repeat purchases / bookings) > At risk (Lapsed) > Lost;
 * 2026-10-27: At risk from 12 months, Lapsed from 24.
 * lib/crm/lifecycle-stage.check.ts runs the same table through the SQL.
 */

const factsOf = (c: (typeof LIFECYCLE_CASES)[number]) => ({
  purchases: c.purchases,
  lastPurchaseAt: c.lastPurchaseAt,
  lastPurchaseDeliveredAt: c.lastPurchaseDeliveredAt,
  bookings: c.bookings,
  lastBookingAt: c.lastBookingAt,
  unsubscribedAt: c.unsubscribedAt,
});

describe.each(LIFECYCLE_CASES)("$name", (c) => {
  const facts = factsOf(c);
  const now = new Date(c.now);

  it(`is ${c.stage}`, () => {
    expect(lifecycleStage(facts, now)).toBe(c.stage);
  });

  it(`has sub-status ${c.detail ?? "none"}`, () => {
    expect(lifecycleDetail(facts, now)).toBe(c.detail);
  });

  it(c.undated ? "is placed without dates" : "has its dates", () => {
    expect(lifecycleUndated(facts)).toBe(c.undated);
  });
});

describe("the table", () => {
  it("reaches every stage and every sub-status", () => {
    expect(new Set(LIFECYCLE_CASES.map((c) => c.stage))).toEqual(new Set(LIFECYCLE_STAGES));
    expect(new Set(LIFECYCLE_CASES.map((c) => c.detail).filter(Boolean))).toEqual(new Set(LIFECYCLE_DETAILS));
  });

  it("gives a sub-status only within its own stage", () => {
    for (const c of LIFECYCLE_CASES) if (c.detail) expect(LIFECYCLE_DETAIL_STAGE[c.detail]).toBe(c.stage);
  });

  it("never puts a buyer without dates At risk, however many orders or how old a booking", () => {
    for (const purchases of [1, 2, 3, 50]) {
      for (const lastBookingAt of [null, "2020-01-01T00:00:00.000Z"]) {
        const facts = { purchases, lastPurchaseAt: null, bookings: lastBookingAt ? 1 : 0, lastBookingAt, unsubscribedAt: null };
        expect(["new", "loyal"]).toContain(lifecycleStage(facts, new Date(NOW)));
      }
    }
  });

  it("puts anyone unsubscribed with nothing since in Lost, whatever else they have", () => {
    for (const c of LIFECYCLE_CASES) {
      const facts = { ...factsOf(c), unsubscribedAt: "2099-01-01T00:00:00.000Z" };
      expect(lifecycleStage(facts, new Date(c.now))).toBe("lost");
      expect(lifecycleDetail({ ...facts }, new Date(c.now))).toBeNull();
    }
  });
});

describe("latestPurchase (ADR 0042 m)", () => {
  const FIT = "2024-05-01T03:00:00.000Z";
  const HERE = "2026-10-01T00:00:00.000Z";

  it("dates a Shopify-only buyer by their latest fitting, delivered then", () => {
    expect(latestPurchase({ hereAt: null, hereDeliveredAt: null, shopifyOrders: 2, lastFittedAt: FIT })).toEqual({
      at: FIT,
      deliveredAt: FIT,
      datedByFitting: true,
    });
  });

  it("keeps a later purchase here, and its delivery", () => {
    expect(latestPurchase({ hereAt: HERE, hereDeliveredAt: null, shopifyOrders: 2, lastFittedAt: FIT })).toEqual({
      at: HERE,
      deliveredAt: null,
      datedByFitting: false,
    });
  });

  it("takes a fitting after the purchase here", () => {
    expect(latestPurchase({ hereAt: FIT, hereDeliveredAt: FIT, shopifyOrders: 1, lastFittedAt: HERE }).datedByFitting).toBe(true);
  });

  it("gives a tie to the purchase here", () => {
    expect(latestPurchase({ hereAt: FIT, hereDeliveredAt: null, shopifyOrders: 1, lastFittedAt: FIT })).toEqual({
      at: FIT,
      deliveredAt: null,
      datedByFitting: false,
    });
  });

  it("dates nothing without a Shopify-era order: a fitting alone is not a purchase", () => {
    for (const shopifyOrders of [0, null]) {
      expect(latestPurchase({ hereAt: null, hereDeliveredAt: null, shopifyOrders, lastFittedAt: FIT })).toEqual({
        at: null,
        deliveredAt: null,
        datedByFitting: false,
      });
    }
  });

  it("leaves a Shopify-era buyer with no fitting undated", () => {
    const p = latestPurchase({ hereAt: null, hereDeliveredAt: null, shopifyOrders: 3, lastFittedAt: null });
    expect(p.at).toBeNull();
    expect(lifecycleUndated({ purchases: 3, lastPurchaseAt: p.at })).toBe(true);
  });

  it("puts a fitting-dated buyer At risk, and Lapsed, as any other", () => {
    const at = (fitted: string) => {
      const p = latestPurchase({ hereAt: null, hereDeliveredAt: null, shopifyOrders: 1, lastFittedAt: fitted });
      const facts = { purchases: 1, lastPurchaseAt: p.at, lastPurchaseDeliveredAt: p.deliveredAt, bookings: 0, lastBookingAt: null, unsubscribedAt: null };
      return [lifecycleStage(facts, new Date(NOW)), lifecycleDetail(facts, new Date(NOW))];
    };
    expect(at("2024-05-01T00:00:00.000Z")).toEqual(["at_risk", "lapsed"]);
    expect(at("2025-06-01T00:00:00.000Z")).toEqual(["at_risk", null]);
    expect(at("2026-06-01T00:00:00.000Z")).toEqual(["new", "settled"]);
    expect(at("2026-10-20T00:00:00.000Z")).toEqual(["new", "delivered"]);
  });
});

describe("labels", () => {
  it("names and explains every stage and sub-status", () => {
    for (const s of LIFECYCLE_STAGES) {
      expect(LIFECYCLE_STAGE_LABEL[s]).toBeTruthy();
      expect(LIFECYCLE_STAGE_RULE[s]).toBeTruthy();
    }
    for (const d of LIFECYCLE_DETAILS) expect(LIFECYCLE_DETAIL_LABEL[d]).toBeTruthy();
    expect(LIFECYCLE_STAGE_RULE.at_risk).toBe("No purchase or attended booking for over 12 months (Lapsed over 24)");
    expect(LIFECYCLE_STAGE_RULE.loyal).toBe("2 or more purchases, or an attended re-adjustment booking");
  });
});
