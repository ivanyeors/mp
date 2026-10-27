import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_DELIVERIES,
  LIFECYCLE_DELIVERY_LABEL,
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABEL,
  LIFECYCLE_STAGE_RULE,
  lifecycleDelivery,
  lifecycleStage,
  lifecycleUndated,
} from "@/lib/crm/lifecycle-stage";
import { LIFECYCLE_CASES } from "./lifecycle-stage-cases";

/**
 * PRD-crm-retention-loop slice 03: the Lifecycle stage. Owner, 2026-10-27:
 * At risk from 12 months after the last purchase, Lapsed from 24, Loyal from
 * 3 purchases. lib/crm/lifecycle-stage.check.ts runs the same table through
 * the SQL.
 */

describe.each(LIFECYCLE_CASES)("$name", (c) => {
  const facts = { purchases: c.purchases, lastPurchaseAt: c.lastPurchaseAt, lastPurchaseDeliveredAt: c.lastPurchaseDeliveredAt };
  const now = new Date(c.now);

  it(`is ${c.stage}`, () => {
    expect(lifecycleStage(facts, now)).toBe(c.stage);
  });

  it(`has delivery ${c.delivery ?? "none"}`, () => {
    expect(lifecycleDelivery(facts, now)).toBe(c.delivery);
  });

  it(c.undated ? "is placed without dates" : "has its dates", () => {
    expect(lifecycleUndated(facts)).toBe(c.undated);
  });
});

describe("the table", () => {
  it("reaches every stage and every delivery step", () => {
    expect(new Set(LIFECYCLE_CASES.map((c) => c.stage))).toEqual(new Set(LIFECYCLE_STAGES));
    expect(new Set(LIFECYCLE_CASES.map((c) => c.delivery).filter(Boolean))).toEqual(new Set(LIFECYCLE_DELIVERIES));
  });

  it("never puts a buyer without dates At risk or Lapsed, however many orders", () => {
    for (const purchases of [1, 2, 3, 50]) {
      expect(["new", "repeat", "loyal"]).toContain(lifecycleStage({ purchases, lastPurchaseAt: null }, new Date()));
    }
  });
});

describe("labels", () => {
  it("names and explains every stage and delivery step", () => {
    for (const s of LIFECYCLE_STAGES) {
      expect(LIFECYCLE_STAGE_LABEL[s]).toBeTruthy();
      expect(LIFECYCLE_STAGE_RULE[s]).toBeTruthy();
    }
    for (const d of LIFECYCLE_DELIVERIES) expect(LIFECYCLE_DELIVERY_LABEL[d]).toBeTruthy();
    expect(LIFECYCLE_STAGE_RULE.at_risk).toBe("Last purchase 12 to 24 months ago");
    expect(LIFECYCLE_STAGE_RULE.lapsed).toBe("Last purchase over 24 months ago");
  });
});
