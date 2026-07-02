import { describe, it, expect } from "vitest";
import {
  calculateAddonCost,
  calculateCustomizationBomCost,
  resolveOrderItemUnitCost,
} from "../order-cost";
import type { ConfigLine, FillingLine } from "@/lib/types/customization";

const coverLine: ConfigLine = {
  item_id: 101,
  category: "cover",
  name: "Cover",
  quantity: 3,
  is_addon: true,
  price_delta: 5,
};

describe("calculateAddonCost", () => {
  it("charges item cost only for quantities above the base BOM", () => {
    const base = new Map<number, number>([[101, 1]]);
    const costByItem = new Map<number, number>([[101, 4]]);
    const cost = calculateAddonCost([coverLine], base, costByItem);
    expect(cost).toBe(8); // 2 extra × 4
  });
});

describe("calculateCustomizationBomCost", () => {
  it("sums quantity × cost across config and filling lines", () => {
    const filling: FillingLine[] = [{ item_id: 10, subtype: "soft", name: "Soft", quantity: 2 }];
    const config: ConfigLine[] = [{ ...coverLine, quantity: 1 }];
    const costByItem = new Map<number, number>([
      [10, 3],
      [101, 5],
    ]);
    expect(calculateCustomizationBomCost(config, filling, costByItem)).toBe(11);
  });
});

describe("resolveOrderItemUnitCost", () => {
  it("uses variant cost_price when there is no customization", () => {
    expect(resolveOrderItemUnitCost({ variantCostPrice: 25, quantity: 2 })).toEqual({
      unit_cost: 25,
      total_cost: 50,
    });
    expect(resolveOrderItemUnitCost({ variantCostPrice: null, quantity: 1 })).toEqual({
      unit_cost: null,
      total_cost: null,
    });
  });

  it("adds customization addon cost to base variant cost", () => {
    const base = new Map<number, number>([[101, 1]]);
    const costByItem = new Map<number, number>([[101, 4]]);
    const result = resolveOrderItemUnitCost({
      variantCostPrice: 20,
      quantity: 2,
      customization: {
        config_lines: [coverLine],
        baseQuantities: base,
        costByItem,
      },
    });
    expect(result).toEqual({ unit_cost: 28, total_cost: 56 });
  });
});
