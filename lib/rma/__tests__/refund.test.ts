import { describe, it, expect } from "vitest";
import { rmaRefundAmount } from "@/lib/rma/refund";

describe("rmaRefundAmount", () => {
  it("sums returned lines at unit price", () => {
    expect(
      rmaRefundAmount([
        { unit_price: 49.99, quantity: 2 },
        { unit_price: 10, quantity: 1 },
      ]),
    ).toBe(109.98);
  });

  it("is zero for no items", () => {
    expect(rmaRefundAmount([])).toBe(0);
  });

  it("rounds to cents (no float drift)", () => {
    expect(rmaRefundAmount([{ unit_price: 0.1, quantity: 3 }])).toBe(0.3);
  });
});
