import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCouponDiscountAmount } from "@/lib/ecommerce/coupon-math";
import type { CouponLineItem } from "@/lib/ecommerce/discounts";
import type { ComposedSellableKey } from "@/lib/results/composed-sellable";
import type { Coupon } from "@/lib/types/ecommerce";

export type ResultCouponTerms = {
  discount_type: Coupon["discount_type"];
  discount_value: number;
  max_discount: number | null;
};

export function couponTermsOf(
  coupon: Pick<Coupon, "discount_type" | "discount_value" | "max_discount">,
): ResultCouponTerms {
  return {
    discount_type: coupon.discount_type,
    discount_value: Number(coupon.discount_value),
    max_discount: coupon.max_discount == null ? null : Number(coupon.max_discount),
  };
}

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

export type ResultCoupon = { code: string; terms: ResultCouponTerms };

export function resultCouponOf(code: unknown, rawTerms: unknown): ResultCoupon | null {
  const terms = parseCouponTerms(rawTerms);
  return typeof code === "string" && code && terms ? { code, terms } : null;
}

export type ResultCouponPricing = {
  discount: number;
  freeShipping: boolean;
};

const NO_COUPON: ResultCouponPricing = { discount: 0, freeShipping: false };

export function resultCouponPricing(rawTerms: unknown, goods: number): ResultCouponPricing {
  const terms = parseCouponTerms(rawTerms);
  if (!terms) return NO_COUPON;
  if (terms.discount_type === "free_shipping") return { discount: 0, freeShipping: true };
  const base = Math.max(0, goods);
  return { discount: Math.min(base, computeCouponDiscountAmount(terms, base)), freeShipping: false };
}

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

export async function resultCouponLineItems(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  goods: number,
  appliesTo: Coupon["applies_to"],
): Promise<CouponLineItem[]> {
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
