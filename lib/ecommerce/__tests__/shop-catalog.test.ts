import { describe, it, expect } from "vitest";
import {
  isShopCatalogProduct,
  CUSTOM_COMPOSED_PRODUCT_TYPES,
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
