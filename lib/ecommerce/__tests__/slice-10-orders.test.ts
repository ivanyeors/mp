import { describe, it, expect } from "vitest";
import { sumOrderItemQuantities } from "../orders";

describe("Slice 10 — order list item counts", () => {
  it("sums line quantities, not row count", () => {
    expect(
      sumOrderItemQuantities([
        { quantity: 2 },
        { quantity: 3 },
        { quantity: 1 },
      ])
    ).toBe(6);
  });

  it("treats missing quantities as zero", () => {
    expect(sumOrderItemQuantities([{ quantity: 2 }, {}, { quantity: null }])).toBe(2);
    expect(sumOrderItemQuantities(null)).toBe(0);
    expect(sumOrderItemQuantities([])).toBe(0);
  });
});
