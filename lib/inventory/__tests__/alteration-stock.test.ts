import { describe, expect, it } from "vitest";
import { stockInRows } from "../alteration-stock";

describe("stockInRows", () => {
  it("receives a plain item as-is, regardless of any base balance", () => {
    expect(stockInRows({ id: 67, category: "filling", alteration_of_item_id: null }, 5, 0)).toEqual([
      { item_id: 67, quantity_signed: 5, reason: "receive" },
    ]);
  });

  it("converts an altered filling out of its base, netting zero pieces", () => {
    const rows = stockInRows({ id: 72, category: "filling", alteration_of_item_id: 67 }, 10, 1358);
    expect(rows).toEqual([
      { item_id: 72, quantity_signed: 10, reason: "assemble", metadata: { converted_from_item_id: 67 } },
      { item_id: 67, quantity_signed: -10, reason: "assemble", metadata: { converted_to_item_id: 72 } },
    ]);
    expect(rows.reduce((sum, r) => sum + r.quantity_signed, 0)).toBe(0);
  });

  it("allows converting exactly what the base holds", () => {
    expect(stockInRows({ id: 72, category: "filling", alteration_of_item_id: 67 }, 10, 10)).toHaveLength(2);
  });

  it("refuses to convert more than the base holds", () => {
    expect(() => stockInRows({ id: 72, category: "filling", alteration_of_item_id: 67 }, 11, 10)).toThrow(
      "Only 10 of the base filling on hand",
    );
    expect(() => stockInRows({ id: 72, category: "filling", alteration_of_item_id: 67 }, 1, -4)).toThrow(
      "Only 0 of the base filling on hand",
    );
  });

  it("ignores a stray alteration link on a non-filling item", () => {
    expect(stockInRows({ id: 9, category: "cover", alteration_of_item_id: 67 }, 2, 0)).toEqual([
      { item_id: 9, quantity_signed: 2, reason: "receive" },
    ]);
  });
});
