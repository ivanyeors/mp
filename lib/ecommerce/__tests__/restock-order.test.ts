import { describe, it, expect } from "vitest";
import { restockQuantityAllowed, reverseSaleRows } from "../restock-order";

describe("restockQuantityAllowed", () => {
  it("allows restock within sold quantity", () => {
    expect(restockQuantityAllowed(3, 0, 2)).toBe(true);
    expect(restockQuantityAllowed(3, 2, 1)).toBe(true);
  });

  it("rejects restock beyond sold quantity", () => {
    expect(restockQuantityAllowed(3, 2, 2)).toBe(false);
    expect(restockQuantityAllowed(1, 1, 1)).toBe(false);
  });

  it("rejects non-positive quantities", () => {
    expect(restockQuantityAllowed(3, 0, 0)).toBe(false);
    expect(restockQuantityAllowed(3, 0, -1)).toBe(false);
  });
});

describe("reverseSaleRows", () => {
  it("returns a Result line's sold Items, merged per Item", () => {
    const rows = reverseSaleRows(
      [
        { item_id: 1, quantity_signed: -2 },
        { item_id: 2, quantity_signed: -1 },
        { item_id: 1, quantity_signed: -1 },
      ],
      1,
      1,
      { restock: true },
    );
    expect(rows).toEqual([
      { item_id: 1, quantity_signed: 3, reason: "receive", metadata: { restock: true } },
      { item_id: 2, quantity_signed: 1, reason: "receive", metadata: { restock: true } },
    ]);
  });

  it("returns nothing when no sale rows were written", () => {
    expect(reverseSaleRows([], 1, 1, {})).toEqual([]);
  });
});
