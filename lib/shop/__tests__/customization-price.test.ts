import { describe, expect, it } from "vitest";
import {
  customizationDelta,
  priceCustomizedBuild,
  type CustomizationPricingInputs,
} from "@/lib/shop/customization-price";
import type { ConfigLine } from "@/lib/types/customization";

/**
 * Live Costings values (prod, 2026-09-13). The point of this file is that the shop
 * customizer now reaches the same numbers `/mp-config` does — it used to charge the
 * full MSRP of any case you swapped TO, and nothing back for the one you swapped
 * FROM.
 */

const SATIN_XS = 25;
const LINEN_XS = 65; // items 6 / 42
const FIBRECOOL_XS = 88; // item 32

const line = (over: Partial<ConfigLine> & Pick<ConfigLine, "item_id" | "category">): ConfigLine => ({
  name: "x",
  quantity: 1,
  is_addon: false,
  // Browser-supplied and deliberately absurd: nothing may read it.
  price_delta: 9999,
  ...over,
});

/** Basic XS: one cover, one linen case, Costings row 170. */
const basicXs: CustomizationPricingInputs = {
  msrp_by_family: { "": 170 },
  default_cover: { item_id: 1, msrp: SATIN_XS, quantity: 1 },
  default_case: { item_id: 42, msrp: LINEN_XS, family: "linen", quantity: 1 },
  case_options: [
    { item_id: 42, msrp: LINEN_XS, family: "linen" },
    { item_id: 6, msrp: LINEN_XS, family: "linen" },
    { item_id: 32, msrp: FIBRECOOL_XS, family: "fibrecool" },
  ],
  cover_options: [{ item_id: 1, msrp: SATIN_XS }],
  shelf_price: 170,
};

/** Premium XS: TWO covers, ships Fibrecool, two family rows (340 linen / 360 fibrecool). */
const premiumXs: CustomizationPricingInputs = {
  msrp_by_family: { linen: 340, fibrecool: 360 },
  default_cover: { item_id: 1, msrp: SATIN_XS, quantity: 2 },
  default_case: { item_id: 32, msrp: FIBRECOOL_XS, family: "fibrecool", quantity: 1 },
  case_options: basicXs.case_options,
  cover_options: [
    { item_id: 1, msrp: SATIN_XS },
    { item_id: 29, msrp: 33 }, // Deep Blue Batik
  ],
  shelf_price: 360,
};

const bom = (entries: Array<[number, number]>) => new Map<number, number>(entries);
const noExtraPrices = new Map<number, number | null>();

describe("priceCustomizedBuild — a swap is not an extra part", () => {
  it("basic XS with the Fibrecool case is 193, not 258", () => {
    // 258 is what shipped: 170 + the whole 88, on top of a row that already
    // includes a 65 case.
    const r = priceCustomizedBuild({
      pricing: basicXs,
      lines: [line({ item_id: 1, category: "cover" }), line({ item_id: 32, category: "case" })],
      baseQuantityByItem: bom([[1, 1], [42, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: true, subtotal: 193, caseDelta: 23 });
    expect(customizationDelta(r, basicXs.shelf_price)).toBe(23);
  });

  it("leaving the build alone costs the shelf price exactly", () => {
    const r = priceCustomizedBuild({
      pricing: basicXs,
      lines: [line({ item_id: 1, category: "cover" }), line({ item_id: 42, category: "case" })],
      baseQuantityByItem: bom([[1, 1], [42, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(customizationDelta(r, basicXs.shelf_price)).toBe(0);
  });

  it("ignores the price_delta the browser sends", () => {
    // Every fixture line carries price_delta 9999. If it were read, nothing above
    // would land on a Costings number.
    const r = priceCustomizedBuild({
      pricing: basicXs,
      lines: [line({ item_id: 32, category: "case", price_delta: 9999 })],
      baseQuantityByItem: bom([[1, 1], [42, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: true, subtotal: 193 });
  });
});

describe("priceCustomizedBuild — a cheaper choice reduces the price", () => {
  it("premium XS moving from its Fibrecool build to linen is -20", () => {
    // The shelf price is 360 (Fibrecool). Linen is its own Costings row at 340, so
    // the delta is negative — the old rule clamped this to 0 and charged 360.
    const r = priceCustomizedBuild({
      pricing: premiumXs,
      lines: [line({ item_id: 1, category: "cover", quantity: 2 }), line({ item_id: 42, category: "case" })],
      baseQuantityByItem: bom([[1, 2], [32, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: true, subtotal: 340 });
    expect(customizationDelta(r, premiumXs.shelf_price)).toBe(-20);
  });

  it("a dearer cover moves by the difference ONCE PER COVER THE BOM SHIPS", () => {
    // Premium ships two. 340 + (33-25)*2 = 356.
    const r = priceCustomizedBuild({
      pricing: premiumXs,
      lines: [line({ item_id: 29, category: "cover", quantity: 2 }), line({ item_id: 42, category: "case" })],
      baseQuantityByItem: bom([[1, 2], [32, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: true, subtotal: 356, coverDelta: 16 });
  });
});

describe("priceCustomizedBuild — genuine extras still cost full MSRP", () => {
  it("a protector above the BOM is added at its own price", () => {
    const r = priceCustomizedBuild({
      pricing: basicXs,
      lines: [
        line({ item_id: 42, category: "case" }),
        line({ item_id: 70, category: "protector", quantity: 2 }),
      ],
      baseQuantityByItem: bom([[1, 1], [42, 1], [70, 1]]),
      msrpByItem: new Map([[70, 30]]),
    });
    expect(r).toMatchObject({ ok: true, addons: 30, subtotal: 200 });
  });

  it("a THIRD cover on a two-cover build is one extra, not three", () => {
    const r = priceCustomizedBuild({
      pricing: premiumXs,
      lines: [line({ item_id: 1, category: "cover", quantity: 3 }), line({ item_id: 42, category: "case" })],
      baseQuantityByItem: bom([[1, 2], [32, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: true, addons: SATIN_XS, subtotal: 340 + SATIN_XS });
  });
});

describe("priceCustomizedBuild — refusals", () => {
  it("refuses an unpriced component rather than treating it as free", () => {
    const r = priceCustomizedBuild({
      pricing: basicXs,
      lines: [
        line({ item_id: 42, category: "case" }),
        line({ item_id: 99, category: "protector", quantity: 2 }),
      ],
      baseQuantityByItem: bom([[42, 1], [99, 1]]),
      msrpByItem: new Map([[99, null]]),
    });
    expect(r).toMatchObject({ ok: false, code: "unpriced_component" });
    expect(customizationDelta(r, basicXs.shelf_price)).toBeNull();
  });

  it("refuses a family with no Costings row — XL has no Fibrecool price", () => {
    const xl: CustomizationPricingInputs = {
      msrp_by_family: { linen: 680 },
      default_cover: { item_id: 5, msrp: 35, quantity: 2 },
      default_case: { item_id: 46, msrp: 113, family: "linen", quantity: 1 },
      case_options: [
        { item_id: 46, msrp: 113, family: "linen" },
        { item_id: 37, msrp: null, family: "fibrecool" },
      ],
      cover_options: [{ item_id: 5, msrp: 35 }],
      shelf_price: 680,
    };
    const r = priceCustomizedBuild({
      pricing: xl,
      lines: [line({ item_id: 37, category: "case" })],
      baseQuantityByItem: bom([[5, 2], [46, 1]]),
      msrpByItem: noExtraPrices,
    });
    expect(r).toMatchObject({ ok: false });
  });
});
