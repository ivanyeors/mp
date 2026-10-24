import { describe, it, expect } from "vitest";
import {
  computeCouponDiscountAmount,
  countCustomerCouponUses,
  exceedsPerCustomerLimit,
  resolveCouponDiscountBase,
  type CouponLineItem,
  type CouponUseOrder,
} from "@/lib/ecommerce/discounts";
import type { Coupon } from "@/lib/types/ecommerce";

const COUPON_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";
const PRODUCT_A = "33333333-3333-3333-3333-333333333333";
const PRODUCT_B = "44444444-4444-4444-4444-444444444444";
const CATEGORY_X = "55555555-5555-5555-5555-555555555555";

function order(overrides: Partial<CouponUseOrder>): CouponUseOrder {
  return {
    coupon_id: COUPON_ID,
    customer_id: CUSTOMER_ID,
    email: "shopper@example.com",
    status: "confirmed",
    paid_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveCouponDiscountBase — applies_to scoping", () => {
  const lineItems: CouponLineItem[] = [
    { productId: PRODUCT_A, categoryId: CATEGORY_X, lineTotal: 60 },
    { productId: PRODUCT_B, categoryId: null, lineTotal: 40 },
  ];

  it("uses full subtotal when applies_to is empty", () => {
    const result = resolveCouponDiscountBase(100, null, undefined, undefined, lineItems);
    expect(result).toEqual({ eligible: true, discountBase: 100 });
  });

  it("limits discount base to scoped product lines", () => {
    const result = resolveCouponDiscountBase(
      100,
      { product_ids: [PRODUCT_A] },
      undefined,
      undefined,
      lineItems,
    );
    expect(result).toEqual({ eligible: true, discountBase: 60 });
  });

  it("limits discount base to scoped category lines", () => {
    const result = resolveCouponDiscountBase(
      100,
      { category_ids: [CATEGORY_X] },
      undefined,
      undefined,
      lineItems,
    );
    expect(result).toEqual({ eligible: true, discountBase: 60 });
  });

  it("rejects when no cart lines match scope", () => {
    const result = resolveCouponDiscountBase(
      100,
      { product_ids: ["99999999-9999-9999-9999-999999999999"] },
      undefined,
      undefined,
      lineItems,
    );
    expect(result.eligible).toBe(false);
    expect(result.error).toMatch(/doesn't apply/i);
  });
});

describe("countCustomerCouponUses", () => {
  const orders: CouponUseOrder[] = [
    order({}),
    order({ status: "cancelled" }),
    order({ paid_at: null, status: "pending" }),
    order({ coupon_id: "other-coupon" }),
    order({ customer_id: "other-customer", email: "other@example.com" }),
    order({ email: "Shopper@Example.COM" }),
  ];

  it("counts paid non-cancelled orders by customer_id", () => {
    expect(
      countCustomerCouponUses(orders, COUPON_ID, { customerId: CUSTOMER_ID }),
    ).toBe(2);
  });

  it("counts paid non-cancelled orders by email case-insensitively", () => {
    expect(
      countCustomerCouponUses(orders, COUPON_ID, { customerEmail: "shopper@example.com" }),
    ).toBe(2);
  });

  it("returns 0 when no customer identity is provided", () => {
    expect(countCustomerCouponUses(orders, COUPON_ID, {})).toBe(0);
  });
});

describe("exceedsPerCustomerLimit", () => {
  it("rejects when uses reach the limit", () => {
    expect(exceedsPerCustomerLimit(1, 1)).toBe(true);
    expect(exceedsPerCustomerLimit(2, 1)).toBe(true);
  });

  it("allows when under the limit or limit is unset", () => {
    expect(exceedsPerCustomerLimit(0, 1)).toBe(false);
    expect(exceedsPerCustomerLimit(5, null)).toBe(false);
  });
});

describe("cart validation discount amount", () => {
  const percentageCoupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount" | "applies_to"> = {
    discount_type: "percentage",
    discount_value: 10,
    max_discount: null,
    applies_to: { product_ids: [PRODUCT_A] },
  };

  it("computes scoped percentage discount from line items", () => {
    const subtotal = 100;
    const lineItems: CouponLineItem[] = [
      { productId: PRODUCT_A, categoryId: CATEGORY_X, lineTotal: 60 },
      { productId: PRODUCT_B, categoryId: null, lineTotal: 40 },
    ];

    const scope = resolveCouponDiscountBase(
      subtotal,
      percentageCoupon.applies_to,
      undefined,
      undefined,
      lineItems,
    );
    expect(scope.eligible).toBe(true);

    const discount = computeCouponDiscountAmount(percentageCoupon, scope.discountBase);
    expect(discount).toBe(6);
  });

  it("caps percentage discount at max_discount", () => {
    const coupon = { ...percentageCoupon, max_discount: 5 };
    const discount = computeCouponDiscountAmount(coupon, 60);
    expect(discount).toBe(5);
  });

  it("computes fixed_amount against scoped base", () => {
    const fixedCoupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount"> = {
      discount_type: "fixed_amount",
      discount_value: 25,
      max_discount: null,
    };
    const discount = computeCouponDiscountAmount(fixedCoupon, 20);
    expect(discount).toBe(20);
  });
});
