import { describe, it, expect } from "vitest";
import { buildLinesCost, resolveOrderItemUnitCost } from "../order-cost";

describe("buildLinesCost", () => {
  it("sums quantity × cost over every line, fillings included", () => {
    const costByItem = new Map<number, number>([
      [101, 5],
      [10, 3],
    ]);
    expect(buildLinesCost([{ item_id: 101, quantity: 2 }, { item_id: 10, quantity: 4 }], costByItem)).toBe(22);
  });

  it("counts an Item with no cost price as 0, like a Result's build", () => {
    expect(buildLinesCost([{ item_id: 1, quantity: 1 }, { item_id: 2, quantity: 3 }], new Map([[1, 4]]))).toBe(4);
  });
});

describe("resolveOrderItemUnitCost", () => {
  it("uses variant cost_price when the line has no build", () => {
    expect(resolveOrderItemUnitCost({ variantCostPrice: 25, quantity: 2 })).toEqual({
      unit_cost: 25,
      total_cost: 50,
    });
    expect(resolveOrderItemUnitCost({ variantCostPrice: null, quantity: 1 })).toEqual({
      unit_cost: null,
      total_cost: null,
    });
    expect(resolveOrderItemUnitCost({ variantCostPrice: 7, quantity: 1, buildLines: [] })).toEqual({
      unit_cost: 7,
      total_cost: 7,
    });
  });

  it("costs the build the sale deducts, not the Variant's recipe-only cost_price", () => {
    const buildLines = [
      { item_id: 101, quantity: 2 },
      { item_id: 102, quantity: 1 },
      { item_id: 103, quantity: 1 },
      { item_id: 10, quantity: 12 },
    ];
    const costByItem = new Map<number, number>([
      [101, 4],
      [102, 11],
      [103, 10],
      [10, 2],
    ]);
    const result = resolveOrderItemUnitCost({ variantCostPrice: 30, quantity: 2, buildLines, costByItem });
    expect(result).toEqual({ unit_cost: 53, total_cost: 106 });
  });
});
