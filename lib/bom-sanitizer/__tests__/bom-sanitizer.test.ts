import { describe, it, expect } from "vitest";
import { stripFillingLines, rejectFillingLines } from "@/lib/bom-sanitizer";

describe("stripFillingLines", () => {
  const cats = new Map([
    [1, "packaging"],
    [2, "filling"],
    [3, "protector"],
  ]);

  it("drops filling lines and keeps non-filling", () => {
    const lines = [
      { item_id: 1, quantity: 1 },
      { item_id: 2, quantity: 3 },
      { item_id: 3, quantity: 1 },
    ];
    expect(stripFillingLines(lines, cats)).toEqual([
      { item_id: 1, quantity: 1 },
      { item_id: 3, quantity: 1 },
    ]);
  });

  it("returns empty when all lines are fillings", () => {
    expect(stripFillingLines([{ item_id: 2, quantity: 5 }], cats)).toEqual([]);
  });
});

describe("rejectFillingLines", () => {
  it("accepts non-filling lines", () => {
    expect(
      rejectFillingLines([
        { item_id: 1, category: "packaging" },
        { item_id: 3, category: "protector" },
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects filling lines with clear error", () => {
    const result = rejectFillingLines([
      { item_id: 1, category: "packaging" },
      { item_id: 9, category: "filling" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Warehouse templates");
      expect(result.error).toContain("9");
    }
  });
});
