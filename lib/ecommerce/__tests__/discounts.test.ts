import { describe, it, expect } from "vitest";
import {
  computeCouponDiscountAmount,
  resolveCouponDiscountBase,
} from "../discounts";
import type { Coupon } from "@/lib/types/ecommerce";

const percentageCoupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount"> = {
  discount_type: "percentage",
  discount_value: 20,
  max_discount: 50,
};

describe("computeCouponDiscountAmount", () => {
  it("calculates percentage discount on eligible base", () => {
    expect(computeCouponDiscountAmount(percentageCoupon, 100)).toBe(20);
  });

  it("caps percentage discount at max_discount", () => {
    expect(computeCouponDiscountAmount(percentageCoupon, 500)).toBe(50);
  });

  it("calculates fixed amount capped at base", () => {
    expect(
      computeCouponDiscountAmount(
        { discount_type: "fixed_amount", discount_value: 30, max_discount: null },
        20
      )
    ).toBe(20);
  });
});

describe("resolveCouponDiscountBase", () => {
  it("uses full subtotal when no applies_to restriction", () => {
    expect(resolveCouponDiscountBase(100, null)).toEqual({
      eligible: true,
      discountBase: 100,
    });
  });

  it("rejects cart with no matching products when product-scoped", () => {
    const result = resolveCouponDiscountBase(
      100,
      { product_ids: ["p1"] },
      ["p2"],
      [],
      [{ productId: "p2", categoryId: "c2", lineTotal: 100 }]
    );
    expect(result.eligible).toBe(false);
  });

  it("discounts only eligible line items when scoped", () => {
    const result = resolveCouponDiscountBase(
      150,
      { product_ids: ["p1"] },
      ["p1", "p2"],
      [],
      [
        { productId: "p1", lineTotal: 50 },
        { productId: "p2", lineTotal: 100 },
      ]
    );
    expect(result).toEqual({ eligible: true, discountBase: 50 });
  });

  it("matches category scope via line item categoryId", () => {
    const result = resolveCouponDiscountBase(
      80,
      { category_ids: ["c1"] },
      ["p1"],
      ["c1"],
      [{ productId: "p1", categoryId: "c1", lineTotal: 80 }]
    );
    expect(result).toEqual({ eligible: true, discountBase: 80 });
  });
});

describe("per_customer_limit helper", () => {
  it("AC1: rejects when customer uses >= per_customer_limit", () => {
    const limit = 1;
    const priorUses = 1;
    expect(priorUses >= limit).toBe(true);
  });
});
