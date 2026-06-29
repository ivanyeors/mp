import { describe, it, expect } from "vitest";
import { resolveStockAvailable, UNTRACKED_STOCK } from "../stock";

describe("resolveStockAvailable (mirrors variant_stock view)", () => {
  it("returns infinite availability when track_inventory is false", () => {
    expect(
      resolveStockAvailable({ track_inventory: false, stock_quantity: 0 })
    ).toBe(UNTRACKED_STOCK);
  });

  it("resolves pillow variants via pillow buildable (min across BOM)", () => {
    const out = resolveStockAvailable(
      { track_inventory: true, stock_quantity: 999, pillow_product_id: 7 },
      { pillowBuildable: new Map([[7, 4]]) }
    );
    expect(out).toBe(4);
  });

  it("resolves part variants via item on-hand", () => {
    const out = resolveStockAvailable(
      { track_inventory: true, stock_quantity: 999, item_id: 12 },
      { itemOnHand: new Map([[12, 9]]) }
    );
    expect(out).toBe(9);
  });

  it("resolves bolster variants via bolster buildable, case-insensitively", () => {
    const out = resolveStockAvailable(
      { track_inventory: true, stock_quantity: 999, is_bolster: true },
      {
        bolsterBuildable: new Map([["medium", 3]]),
        bolsterVariantKey: "Medium",
      }
    );
    expect(out).toBe(3);
  });

  it("falls back to the raw stock_quantity column when nothing else links", () => {
    expect(
      resolveStockAvailable({ track_inventory: true, stock_quantity: 5 })
    ).toBe(5);
  });

  it("treats a missing/unmatched source as zero (not the raw column)", () => {
    expect(
      resolveStockAvailable(
        { track_inventory: true, stock_quantity: 999, pillow_product_id: 7 },
        { pillowBuildable: new Map() }
      )
    ).toBe(0);
    expect(
      resolveStockAvailable(
        { track_inventory: true, stock_quantity: 999, is_bolster: true },
        { bolsterBuildable: new Map([["short", 2]]), bolsterVariantKey: "medium" }
      )
    ).toBe(0);
  });
});
