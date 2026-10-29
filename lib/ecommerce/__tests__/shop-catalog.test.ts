import { describe, it, expect } from "vitest";
import {
  isListedShopProduct,
  isShopCatalogProduct,
  CUSTOM_COMPOSED_PRODUCT_TYPES,
  shopCardPrice,
} from "@/lib/ecommerce/products";

describe("shop catalog — accessories only", () => {
  it("excludes pillow and bolster composed products", () => {
    expect(isShopCatalogProduct({ product_type: "pillow" })).toBe(false);
    expect(isShopCatalogProduct({ product_type: "bolster" })).toBe(false);
    expect(CUSTOM_COMPOSED_PRODUCT_TYPES).toEqual(["pillow", "bolster"]);
  });

  it("includes accessories and other non-custom sellables", () => {
    expect(isShopCatalogProduct({ product_type: "accessory" })).toBe(true);
    expect(isShopCatalogProduct({ product_type: "bundle" })).toBe(true);
  });
});

describe("isListedShopProduct (CONTEXT.md, Listed)", () => {
  const v = (is_active: boolean) => ({ is_active });
  it("is an active shop product with at least one active Variant", () => {
    expect(isListedShopProduct({ status: "active", product_type: "accessory", product_variants: [v(false), v(true)] })).toBe(true);
    expect(isListedShopProduct({ status: "draft", product_type: "accessory", product_variants: [v(true)] })).toBe(false);
    expect(isListedShopProduct({ status: "active", product_type: "accessory", product_variants: [v(false)] })).toBe(false);
    expect(isListedShopProduct({ status: "active", product_type: "accessory", product_variants: [] })).toBe(false);
    // Bought through the configurator, not the shop.
    expect(isListedShopProduct({ status: "active", product_type: "pillow", product_variants: [v(true)] })).toBe(false);
  });
});

describe("shopCardPrice: what components/shop/product-card.tsx shows", () => {
  const v = (price: number, over: { compare_at_price?: number | null; is_active?: boolean } = {}) => ({
    price,
    compare_at_price: over.compare_at_price ?? null,
    currency: "SGD",
    is_active: over.is_active ?? true,
  });

  it("is one Variant's price, as it is", () => {
    expect(shopCardPrice([v(29.5)])).toEqual({ price: 29.5, compareAt: null, varies: false, currency: "SGD" });
  });

  it("is the cheapest active Variant's when there are several, and says when they differ", () => {
    expect(shopCardPrice([v(49), v(39), v(19, { is_active: false })])).toEqual({ price: 39, compareAt: null, varies: true, currency: "SGD" });
    expect(shopCardPrice([v(39), v(39)])).toMatchObject({ price: 39, varies: false });
  });

  it("carries that Variant's compare-at only when it is above the price, as the card strikes it through", () => {
    expect(shopCardPrice([v(45, { compare_at_price: 59 })])).toMatchObject({ price: 45, compareAt: 59 });
    expect(shopCardPrice([v(45, { compare_at_price: 45 })])).toMatchObject({ compareAt: null });
    // Another Variant's sale is not the card's price.
    expect(shopCardPrice([v(39), v(49, { compare_at_price: 59 })])).toMatchObject({ price: 39, compareAt: null });
  });

  it("reads a numeric column that arrives as a string, and has no price with no active Variant", () => {
    expect(shopCardPrice([{ ...v(0), price: "39.00" as unknown as number, compare_at_price: "49.00" as unknown as number }])).toMatchObject({
      price: 39,
      compareAt: 49,
    });
    expect(shopCardPrice([v(39, { is_active: false })])).toBeNull();
  });
});
