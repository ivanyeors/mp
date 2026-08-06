import { describe, it, expect } from "vitest";
import {
  computeSelfPurchaseDiscount,
  remainingSelfPurchaseUnits,
  type SelfPurchaseRate,
  type CommissionableLine,
} from "@/lib/partner-self-purchase";

const rate = (
  kind: "flat" | "percent" | null,
  amount: number,
  unitCap: number,
  unitsUsed: number,
): SelfPurchaseRate => ({ kind, amount, unitCap, unitsUsed });

const line = (unitPrice: number, quantity: number): CommissionableLine => ({ unitPrice, quantity });

describe("remainingSelfPurchaseUnits — cap − used, floored at 0", () => {
  it("cap minus consumed", () => {
    expect(remainingSelfPurchaseUnits({ unitCap: 10, unitsUsed: 3 })).toBe(7);
  });
  it("exhausted → 0", () => {
    expect(remainingSelfPurchaseUnits({ unitCap: 10, unitsUsed: 10 })).toBe(0);
  });
  it("over-consumed → floored at 0 (never negative)", () => {
    expect(remainingSelfPurchaseUnits({ unitCap: 10, unitsUsed: 12 })).toBe(0);
  });
});

describe("computeSelfPurchaseDiscount — percent vs flat", () => {
  it("percent = % of unit price × units", () => {
    const d = computeSelfPurchaseDiscount(rate("percent", 20, 10, 0), [line(100, 2)]);
    expect(d).toEqual({ discountAmount: 40, discountedUnits: 2 });
  });
  it("flat = $ off per unit × units", () => {
    const d = computeSelfPurchaseDiscount(rate("flat", 15, 10, 0), [line(100, 3)]);
    expect(d).toEqual({ discountAmount: 45, discountedUnits: 3 });
  });
  it("rounds to cents", () => {
    // 33% of 10.10 = 3.333 → 3.33
    const d = computeSelfPurchaseDiscount(rate("percent", 33, 10, 0), [line(10.1, 1)]);
    expect(d.discountAmount).toBe(3.33);
  });
});

describe("computeSelfPurchaseDiscount — cap enforcement", () => {
  it("only the first N cap units are discounted; over-cap units stay at MSRP", () => {
    // cap 2, qty 5 → 2 discounted (@ 10% of 100 = 10 each = 20), 3 units at MSRP.
    const d = computeSelfPurchaseDiscount(rate("percent", 10, 2, 0), [line(100, 5)]);
    expect(d).toEqual({ discountAmount: 20, discountedUnits: 2 });
  });
  it("respects already-consumed allowance (remaining = cap − used)", () => {
    // cap 5, used 4 → remaining 1 → only 1 unit discounted regardless of qty.
    const d = computeSelfPurchaseDiscount(rate("flat", 10, 5, 4), [line(100, 3)]);
    expect(d).toEqual({ discountAmount: 10, discountedUnits: 1 });
  });
  it("mixed lines consume the remaining cap in order", () => {
    // cap 3: line1 gives 2 units, line2 gives 1 unit, then cap exhausted.
    const lines = [line(100, 2), line(50, 2)];
    const d = computeSelfPurchaseDiscount(rate("flat", 10, 3, 0), lines);
    // 2×10 (line1) + 1×10 (line2) = 30; second unit of line2 is over-cap at MSRP.
    expect(d).toEqual({ discountAmount: 30, discountedUnits: 3 });
  });
});

describe("computeSelfPurchaseDiscount — feature-off / guards", () => {
  const lines = [line(100, 2)];
  it("null kind → zero", () => {
    expect(computeSelfPurchaseDiscount(rate(null, 20, 10, 0), lines)).toEqual({
      discountAmount: 0,
      discountedUnits: 0,
    });
  });
  it("amount ≤ 0 → zero", () => {
    expect(computeSelfPurchaseDiscount(rate("percent", 0, 10, 0), lines)).toEqual({
      discountAmount: 0,
      discountedUnits: 0,
    });
    expect(computeSelfPurchaseDiscount(rate("flat", -5, 10, 0), lines)).toEqual({
      discountAmount: 0,
      discountedUnits: 0,
    });
  });
  it("remaining ≤ 0 (cap exhausted) → zero", () => {
    expect(computeSelfPurchaseDiscount(rate("percent", 20, 5, 5), lines)).toEqual({
      discountAmount: 0,
      discountedUnits: 0,
    });
  });
  it("no lines → zero", () => {
    expect(computeSelfPurchaseDiscount(rate("percent", 20, 10, 0), [])).toEqual({
      discountAmount: 0,
      discountedUnits: 0,
    });
  });
});

describe("computeSelfPurchaseDiscount — flat never exceeds the unit price", () => {
  it("clamps a flat $ off to the unit price (no negative price)", () => {
    // flat 200 off a $50 unit → capped at 50 per unit.
    const d = computeSelfPurchaseDiscount(rate("flat", 200, 10, 0), [line(50, 1)]);
    expect(d).toEqual({ discountAmount: 50, discountedUnits: 1 });
  });
});
