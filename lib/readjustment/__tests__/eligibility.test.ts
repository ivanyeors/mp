import { describe, expect, it } from "vitest";

import {
  addDays,
  evaluateReadjustment,
  isFreeVisit,
  sgtDate,
  type ReadjustablePurchase,
} from "@/lib/readjustment/eligibility";

const policy = { freeVisits: 1, freeWindowDays: 60 };
const FEE = 30;

// Paid 2026-09-03 10:00 SGT.
const premium: ReadjustablePurchase = {
  source: "platform",
  orderItemId: "item-1",
  productType: "pillow",
  tier: "premium",
  paidAt: "2026-09-03T02:00:00Z",
  units: 1,
};

describe("sgtDate / addDays", () => {
  it("reads a late-night purchase as the Singapore day, not the UTC one", () => {
    // 23:30 SGT on 3 Sep is 15:30 UTC on 3 Sep; 00:30 SGT on 4 Sep is still 3 Sep in UTC.
    expect(sgtDate("2026-09-03T16:30:00Z")).toBe("2026-09-04");
    expect(sgtDate("2026-09-03T15:30:00Z")).toBe("2026-09-03");
  });

  it("adds calendar days across months", () => {
    expect(addDays("2026-09-03", 60)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("evaluateReadjustment — Premium Mpillow, one free visit within 60 days", () => {
  it("is complimentary on the purchase day (day 0)", () => {
    expect(evaluateReadjustment(premium, [], policy, FEE, "2026-09-03")).toEqual({
      complimentary: true,
      fee: 0,
      seq: 1,
      freeUntil: "2026-11-02",
    });
  });

  it("is complimentary on day 60", () => {
    expect(evaluateReadjustment(premium, [], policy, FEE, "2026-11-02").complimentary).toBe(true);
  });

  it("charges the fee on day 61 and says when the window closed", () => {
    expect(evaluateReadjustment(premium, [], policy, FEE, "2026-11-03")).toEqual({
      complimentary: false,
      fee: 30,
      reason: "window_ended",
      windowEndedOn: "2026-11-02",
    });
  });

  it("charges the second visit inside the window", () => {
    expect(evaluateReadjustment(premium, [1], policy, FEE, "2026-09-10")).toMatchObject({
      complimentary: false,
      reason: "free_visit_used",
    });
  });

  it("gives each unit its own free visit", () => {
    const two = { ...premium, units: 2 };
    expect(evaluateReadjustment(two, [1], policy, FEE, "2026-09-10")).toMatchObject({
      complimentary: true,
      seq: 2,
    });
    expect(evaluateReadjustment(two, [1, 2], policy, FEE, "2026-09-10").complimentary).toBe(false);
  });

  it("reuses a sequence number a cancelled booking gave back", () => {
    // seq 1 was cancelled (not in usedSeqs); seq 2 is in use on a two-visit policy.
    expect(
      evaluateReadjustment(premium, [2], { freeVisits: 2, freeWindowDays: 60 }, FEE, "2026-09-10"),
    ).toMatchObject({ complimentary: true, seq: 1 });
  });

  it("offers nothing free when the policy grants zero visits", () => {
    expect(
      evaluateReadjustment(premium, [], { freeVisits: 0, freeWindowDays: 60 }, FEE, "2026-09-10"),
    ).toMatchObject({ complimentary: false, reason: "no_free_visits" });
  });

  it("offers nothing free on a fully returned line", () => {
    expect(evaluateReadjustment({ ...premium, units: 0 }, [], policy, FEE, "2026-09-10")).toMatchObject({
      complimentary: false,
      reason: "no_free_visits",
    });
  });
});

describe("evaluateReadjustment — always charged", () => {
  it.each([
    ["Basic Mpillow", { tier: "basic" as const }],
    ["Mbolster", { productType: "bolster" as const, tier: null }],
    ["a purchase with no paid date", { paidAt: null }],
  ])("%s pays the fee even on day 0", (_label, extra) => {
    expect(evaluateReadjustment({ ...premium, ...extra }, [], policy, FEE, "2026-09-03")).toMatchObject({
      complimentary: false,
      fee: 30,
      reason: "not_premium",
    });
  });

  it("an unlisted purchase pays the fee", () => {
    expect(
      evaluateReadjustment(
        { ...premium, source: "unlisted", orderItemId: null },
        [],
        policy,
        FEE,
        "2026-09-03",
      ),
    ).toEqual({ complimentary: false, fee: 30, reason: "unlisted" });
  });
});

describe("isFreeVisit — booked without a payment", () => {
  it("is a complimentary visit, or any visit while the fee is $0", () => {
    expect(isFreeVisit({ complimentary: true, fee: 0 })).toBe(true);
    expect(isFreeVisit({ complimentary: false, fee: 0 })).toBe(true);
    expect(isFreeVisit({ complimentary: false, fee: 30 })).toBe(false);
  });
});
