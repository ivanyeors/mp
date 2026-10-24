/**
 * A discount code on a Result (ADR 0033).
 *
 * The code is checked once, at hold, the way shop checkout checks it: active,
 * in date, under its limits, over its minimum, in scope. What the Result keeps
 * is the coupon's terms at that moment (`coupon_terms`), and every repricing —
 * the hold, assign, the status page, request-payment, finish, reconfigure and
 * Accept — takes them off the goods it prices then. So the discount follows the
 * build Staff actually assign, an edit to the coupon in Settings never moves a
 * price a customer already authorised, and expiry after the hold does not take
 * the discount back.
 *
 * The discount comes off the goods (build + preferences + add-ons), never off
 * Service fees, shipping or tax; tax is then due on what is left. A free-shipping
 * code zeroes the Result's own shipping. On a Paired build only the Mpillow
 * (the anchor, where shipping is charged) carries the code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
// Type-only beyond the pure maths, so the configurator can price a code too.
import { computeCouponDiscountAmount } from "@/lib/ecommerce/coupon-math";
import type { CouponLineItem } from "@/lib/ecommerce/discounts";
import type { ComposedSellableKey } from "@/lib/results/composed-sellable";
import type { Coupon } from "@/lib/types/ecommerce";

export type ResultCouponTerms = {
  discount_type: Coupon["discount_type"];
  discount_value: number;
  max_discount: number | null;
};

/** The part of a coupon a Result keeps. */
export function couponTermsOf(
  coupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount">,
): ResultCouponTerms {
  return {
    discount_type: coupon.discount_type,
    discount_value: Number(coupon.discount_value),
    max_discount: coupon.max_discount == null ? null : Number(coupon.max_discount),
  };
}

/** `coupon_terms` as stored, or null when absent or not a shape this code wrote. */
export function parseCouponTerms(raw: unknown): ResultCouponTerms | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const type = t.discount_type;
  if (type !== "percentage" && type !== "fixed_amount" && type !== "free_shipping") return null;
  const value = Number(t.discount_value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (type === "percentage" && value > 100) return null;
  const cap = t.max_discount == null ? null : Number(t.max_discount);
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) return null;
  return { discount_type: type, discount_value: value, max_discount: cap };
}

/** A Result's discount code, as a page that reprices the build needs it. */
export type ResultCoupon = { code: string; terms: ResultCouponTerms };

/** The Result's code and terms, or null without a usable pair. */
export function resultCouponOf(code: unknown, rawTerms: unknown): ResultCoupon | null {
  const terms = parseCouponTerms(rawTerms);
  return typeof code === "string" && code && terms ? { code, terms } : null;
}

export type ResultCouponPricing = {
  /** Off the goods. Never more than the goods. */
  discount: number;
  /** The Result's own shipping is free. */
  freeShipping: boolean;
};

const NO_COUPON: ResultCouponPricing = { discount: 0, freeShipping: false };

/** What a Result's stored terms take off goods priced at `goods`. */
export function resultCouponPricing(rawTerms: unknown, goods: number): ResultCouponPricing {
  const terms = parseCouponTerms(rawTerms);
  if (!terms) return NO_COUPON;
  if (terms.discount_type === "free_shipping") return { discount: 0, freeShipping: true };
  const base = Math.max(0, goods);
  return { discount: Math.min(base, computeCouponDiscountAmount(terms, base)), freeShipping: false };
}

/**
 * The Discount row a customer-facing breakdown shows (ADR 0033): the code and
 * what it took off, or undefined when the Result carries none. A free-shipping
 * code shows with 0 off; its saving is the Shipping row reading 0.
 */
export function discountRowOf(
  code: string | null | undefined,
  rawTerms: unknown,
  discount: number,
): { code: string; amount: number } | undefined {
  const terms = parseCouponTerms(rawTerms);
  if (!code || !terms) return undefined;
  if (discount <= 0 && terms.discount_type !== "free_shipping") return undefined;
  return { code, amount: discount };
}

/**
 * The build as a coupon's scope sees it: the storefront product its Composed
 * sellable is listed as, carrying the whole goods subtotal. A coupon limited to
 * the Mpillow product therefore works on an Mpillow customisation, which is the
 * only way to buy one. Empty when the build is not listed; a scoped coupon then
 * does not apply.
 */
export async function resultCouponLineItems(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  goods: number,
  appliesTo: Coupon["applies_to"],
): Promise<CouponLineItem[]> {
  // An unscoped coupon applies to the whole goods subtotal; nothing to look up.
  if (!appliesTo?.product_ids?.length && !appliesTo?.category_ids?.length) return [];
  let productIds: string[] = [];
  if (key.productType === "pillow") {
    const { data: pillow } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", key.size)
      .eq("kind", key.tier)
      .eq("is_active", true)
      .maybeSingle();
    if (pillow) {
      const { data: variants } = await admin
        .from("product_variants")
        .select("product_id")
        .eq("pillow_product_id", pillow.id);
      productIds = (variants ?? []).map((v) => String(v.product_id));
    }
  } else {
    const { data: products } = await admin.from("products").select("id").eq("product_type", "bolster");
    productIds = (products ?? []).map((p) => String(p.id));
  }
  const productId = [...new Set(productIds)].sort()[0];
  if (!productId) return [];
  const { data: product } = await admin
    .from("products")
    .select("id, category_id")
    .eq("id", productId)
    .maybeSingle();
  return [
    {
      productId,
      categoryId: (product?.category_id as string | null | undefined) ?? null,
      lineTotal: goods,
    },
  ];
}
