import { describe, expect, it } from "vitest";
import {
  couponTermsOf,
  discountRowOf,
  parseCouponTerms,
  resultCouponPricing,
} from "@/lib/results/discount";

/**
 * A Result keeps a discount code's terms from the hold (ADR 0033), and every
 * repricing takes them off the goods priced then. These are the rules every
 * repricing site shares.
 */
describe("resultCouponPricing", () => {
  const pct = { discount_type: "percentage", discount_value: 10, max_discount: null };

  it("takes a percentage off the goods priced now, so it follows the assigned build", () => {
    expect(resultCouponPricing(pct, 360)).toEqual({ discount: 36, freeShipping: false });
    expect(resultCouponPricing(pct, 420)).toEqual({ discount: 42, freeShipping: false });
  });

  it("honours the cap the coupon had at hold", () => {
    expect(resultCouponPricing({ ...pct, max_discount: 25 }, 360).discount).toBe(25);
  });

  it("never takes more than the goods", () => {
    expect(
      resultCouponPricing({ discount_type: "fixed_amount", discount_value: 500, max_discount: null }, 120).discount,
    ).toBe(120);
  });

  it("frees shipping without touching the goods", () => {
    expect(
      resultCouponPricing({ discount_type: "free_shipping", discount_value: 1, max_discount: null }, 360),
    ).toEqual({ discount: 0, freeShipping: true });
  });

  it("is nothing for a Result without a code, or terms this code never wrote", () => {
    expect(resultCouponPricing(null, 360)).toEqual({ discount: 0, freeShipping: false });
    expect(resultCouponPricing({ discount_type: "bogus", discount_value: 10 }, 360).discount).toBe(0);
    expect(resultCouponPricing({ discount_type: "percentage", discount_value: 150 }, 360).discount).toBe(0);
    expect(resultCouponPricing({ discount_type: "fixed_amount", discount_value: -5 }, 360).discount).toBe(0);
  });
});

describe("couponTermsOf / parseCouponTerms", () => {
  it("keeps only what pricing needs, and reads it back", () => {
    const terms = couponTermsOf({ discount_type: "fixed_amount", discount_value: 15, max_discount: null });
    expect(terms).toEqual({ discount_type: "fixed_amount", discount_value: 15, max_discount: null });
    expect(parseCouponTerms(JSON.parse(JSON.stringify(terms)))).toEqual(terms);
  });
});

describe("discountRowOf", () => {
  const pct = { discount_type: "percentage", discount_value: 10, max_discount: null };

  it("shows the code and what it took off", () => {
    expect(discountRowOf("SAVE10", pct, 36)).toEqual({ code: "SAVE10", amount: 36 });
  });

  it("shows a free-shipping code with nothing off the goods", () => {
    expect(
      discountRowOf("SHIPFREE", { discount_type: "free_shipping", discount_value: 1, max_discount: null }, 0),
    ).toEqual({ code: "SHIPFREE", amount: 0 });
  });

  it("shows nothing without a code, or when it took nothing off", () => {
    expect(discountRowOf(null, pct, 36)).toBeUndefined();
    expect(discountRowOf("SAVE10", null, 36)).toBeUndefined();
    expect(discountRowOf("SAVE10", pct, 0)).toBeUndefined();
  });
});
