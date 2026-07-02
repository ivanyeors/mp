import { describe, it, expect } from "vitest";
import { computeOrderMargin } from "../order-margins";
import type { LedgerEntry } from "../money-ledger";

const order = {
  orderNumber: "MP-20260702-0001",
  subtotal: 100,
  discountAmount: 10,
  shippingAmount: 5,
  taxAmount: 9,
  total: 104,
};

const charge = (amount: number, id = "pi_1"): LedgerEntry => ({
  type: "charge",
  amount,
  stripeObjectId: id,
});
const refund = (amount: number, id: string): LedgerEntry => ({
  type: "refund",
  amount: -Math.abs(amount),
  stripeObjectId: id,
});

describe("computeOrderMargin", () => {
  it("computes basic margin from product revenue minus COGS", () => {
    const margin = computeOrderMargin(
      order,
      [{ unitCost: 20, totalCost: 40, returnedQuantity: 0 }],
      [charge(104)]
    );
    expect(margin.revenue).toBe(100);
    expect(margin.discount).toBe(10);
    expect(margin.cogs).toBe(40);
    expect(margin.netRevenue).toBe(104);
    expect(margin.grossMargin).toBe(50); // (100-10) - 40
    expect(margin.marginPct).toBeCloseTo(55.56, 1);
  });

  it("partial refund reduces margin via net_revenue ratio on product revenue", () => {
    const full = computeOrderMargin(
      order,
      [{ unitCost: 20, totalCost: 40 }],
      [charge(104)]
    );
    const partial = computeOrderMargin(
      order,
      [{ unitCost: 20, totalCost: 40 }],
      [charge(104), refund(20, "re_1")]
    );
    expect(partial.netRevenue).toBe(84);
    expect(partial.cogs).toBe(full.cogs);
    expect(partial.grossMargin).toBeLessThan(full.grossMargin);
    // product revenue 90 scaled by 84/104 ≈ 72.69; minus COGS 40 ≈ 32.69
    expect(partial.grossMargin).toBeCloseTo(32.69, 1);
  });

  it("dispute_loss reduces net revenue and margin without counting as refund", () => {
    const margin = computeOrderMargin(
      { ...order, total: 100, taxAmount: 5, shippingAmount: 0 },
      [{ unitCost: 30, totalCost: 30 }],
      [
        charge(100),
        { type: "dispute_loss", amount: -25, stripeObjectId: "dp_1" },
      ]
    );
    expect(margin.netRevenue).toBe(75);
    // adjusted product revenue 90 * (75/100) = 67.5; COGS 30 → margin 37.5
    expect(margin.grossMargin).toBeCloseTo(37.5, 1);
  });

  it("returned_quantity reduces COGS only when restocked", () => {
    const noRestock = computeOrderMargin(
      order,
      [{ unitCost: 30, totalCost: 60, returnedQuantity: 0 }],
      [charge(104)]
    );
    const restocked = computeOrderMargin(
      order,
      [{ unitCost: 30, totalCost: 60, returnedQuantity: 1 }],
      [charge(104)]
    );
    expect(noRestock.cogs).toBe(60);
    expect(restocked.cogs).toBe(30);
    expect(restocked.grossMargin).toBeGreaterThan(noRestock.grossMargin);
  });
});
