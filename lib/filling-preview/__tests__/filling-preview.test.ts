import { describe, it, expect } from "vitest";
import { formatFillingPreview, fillingVariantLabel } from "@/lib/filling-preview";

describe("filling-preview", () => {
  const items = new Map([
    [1, { name: "6d", subtype: null, size: "M" }],
    [2, { name: "latex", subtype: "soft", size: null }],
  ]);

  it("formats variant labels with size fallback", () => {
    expect(fillingVariantLabel({ name: "6d", subtype: null, size: "M" })).toBe("6d M");
    expect(fillingVariantLabel({ name: "latex", subtype: "soft", size: null }, "S")).toBe("Soft S");
  });

  it("returns compact variant/qty rows", () => {
    expect(
      formatFillingPreview(
        [
          { item_id: 1, quantity: 2 },
          { item_id: 2, quantity: 1 },
          { item_id: 99, quantity: 3 },
        ],
        items,
        "M",
      ),
    ).toEqual([
      { variant: "6d M", qty: 2 },
      { variant: "Soft M", qty: 1 },
      { variant: "Item #99", qty: 3 },
    ]);
  });

  it("drops zero-qty lines", () => {
    expect(formatFillingPreview([{ item_id: 1, quantity: 0 }], items)).toEqual([]);
  });
});
