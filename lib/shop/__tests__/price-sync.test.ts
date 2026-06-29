import { describe, expect, it } from "vitest";
import { resolveVariantPrice, resolveVariantCost } from "@/lib/shop/price-sync";

const priceByKey = new Map([
  ["product:pillow:1", { msrp: "120.00" }],
  ["product:pillow:2", { msrp: "150.00" }], // premium/linen override
  ["product:bolster:short", { msrp: "80.00" }],
  ["product:bolster:medium", { msrp: "90.00" }],
]);
const priceByPillowProduct = new Map([
  [1, { msrp: "120.00" }],
  [2, { msrp: "150.00" }],
]);
const priceByBolsterVariant = new Map([
  ["short", { msrp: "80.00" }],
  ["medium", { msrp: "90.00" }],
]);

const bomByPillow = new Map([
  [1, [{ item_id: 10, quantity: 1 }, { item_id: 11, quantity: 2 }]],
]);
const bomByBolster = new Map([
  ["short", [{ item_id: 20, quantity: 1 }]],
]);
const costByItem = new Map([
  [10, 30],
  [11, 10],
  [20, 50],
  [99, 25], // direct item link
]);

describe("resolveVariantPrice", () => {
  it("price_key takes priority over pillow_product_id", () => {
    // variant has both; price_key should win (linen override case)
    const v = { price_key: "product:pillow:2", pillow_product_id: 1, option1: null };
    expect(resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant)).toBe(150);
  });

  it("falls back to pillow_product_id when price_key is null", () => {
    const v = { price_key: null, pillow_product_id: 1, option1: null };
    expect(resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant)).toBe(120);
  });

  it("resolves bolster variant by option1", () => {
    const v = { price_key: null, pillow_product_id: null, option1: "short" };
    expect(resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant)).toBe(80);
  });

  it("returns null when no costing source resolves", () => {
    const v = { price_key: null, pillow_product_id: null, option1: "accessory" };
    expect(resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant)).toBeNull();
  });
});

describe("resolveVariantCost", () => {
  it("uses item_id directly for non-pillow variants", () => {
    const v = { item_id: 99, pillow_product_id: null, option1: null };
    expect(resolveVariantCost(v, bomByPillow, bomByBolster, costByItem)).toBe(25);
  });

  it("sums BOM lines for pillow_product_id", () => {
    // item 10 × 1 = 30, item 11 × 2 = 20, total = 50
    const v = { item_id: null, pillow_product_id: 1, option1: null };
    expect(resolveVariantCost(v, bomByPillow, bomByBolster, costByItem)).toBe(50);
  });

  it("sums bolster BOM lines by option1", () => {
    const v = { item_id: null, pillow_product_id: null, option1: "short" };
    expect(resolveVariantCost(v, bomByPillow, bomByBolster, costByItem)).toBe(50);
  });

  it("returns null when no BOM or item link", () => {
    const v = { item_id: null, pillow_product_id: null, option1: null };
    expect(resolveVariantCost(v, bomByPillow, bomByBolster, costByItem)).toBeNull();
  });

  it("returns null when a BOM component is missing a cost", () => {
    const partialCost = new Map([[10, 30]]); // item 11 missing
    const v = { item_id: null, pillow_product_id: 1, option1: null };
    expect(resolveVariantCost(v, bomByPillow, bomByBolster, partialCost)).toBeNull();
  });
});
