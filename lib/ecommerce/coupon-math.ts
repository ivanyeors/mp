import type { Coupon } from "@/lib/types/ecommerce";

/**
 * Pure discount math — testable without DB, and safe in the browser: a page
 * that reprices a customisation shows its discount code with this (ADR 0033).
 */
export function computeCouponDiscountAmount(
  coupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount">,
  discountBase: number,
): number {
  let discountAmount = 0;
  if (coupon.discount_type === "percentage") {
    discountAmount = discountBase * (coupon.discount_value / 100);
    if (coupon.max_discount !== null) {
      discountAmount = Math.min(discountAmount, coupon.max_discount);
    }
  } else if (coupon.discount_type === "fixed_amount") {
    discountAmount = Math.min(coupon.discount_value, discountBase);
  }
  return Math.round(discountAmount * 100) / 100;
}
