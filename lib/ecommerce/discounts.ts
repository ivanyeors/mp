import { supabaseAdmin } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/types/ecommerce";

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  error?: string;
  discount_amount?: number;
}

export async function validateCoupon(
  code: string,
  subtotal: number,
  productIds?: string[],
  categoryIds?: string[],
): Promise<CouponValidationResult> {
  const admin = supabaseAdmin();
  const normalized = code.toUpperCase().trim();

  const { data, error } = await admin
    .from("coupons")
    .select("*")
    .eq("is_active", true)
    .ilike("code", normalized)
    .single();

  if (error || !data) {
    return { valid: false, error: "Invalid coupon code" };
  }

  const coupon = data as Coupon;
  const now = new Date();

  // Check date range
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, error: "Coupon is not yet active" };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, error: "Coupon has expired" };
  }

  // Check usage limit
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, error: "Coupon usage limit reached" };
  }

  // Check minimum order
  if (coupon.min_order_amount !== null && subtotal < coupon.min_order_amount) {
    return { valid: false, error: `Minimum order amount is ${coupon.currency} ${coupon.min_order_amount.toFixed(2)}` };
  }

  // Check applies_to restrictions
  if (coupon.applies_to) {
    const { product_ids, category_ids } = coupon.applies_to;
    if (product_ids?.length && productIds) {
      const hasMatch = productIds.some((id) => product_ids.includes(id));
      if (!hasMatch) return { valid: false, error: "Coupon does not apply to items in your cart" };
    }
    if (category_ids?.length && categoryIds) {
      const hasMatch = categoryIds.some((id) => category_ids.includes(id));
      if (!hasMatch) return { valid: false, error: "Coupon does not apply to items in your cart" };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discount_type === "percentage") {
    discountAmount = subtotal * (coupon.discount_value / 100);
    if (coupon.max_discount !== null) {
      discountAmount = Math.min(discountAmount, coupon.max_discount);
    }
  } else if (coupon.discount_type === "fixed_amount") {
    discountAmount = Math.min(coupon.discount_value, subtotal);
  }
  // free_shipping: discount_amount stays 0, handled in shipping calculation

  return { valid: true, coupon, discount_amount: Math.round(discountAmount * 100) / 100 };
}

export async function incrementCouponUsage(couponId: string) {
  const admin = supabaseAdmin();
  const { error } = await admin.rpc("increment_coupon_usage", { coupon_id: couponId }).single();
  // Fallback if RPC doesn't exist: manual increment
  if (error) {
    const { data } = await admin.from("coupons").select("usage_count").eq("id", couponId).single();
    if (data) {
      await admin.from("coupons").update({ usage_count: data.usage_count + 1 }).eq("id", couponId);
    }
  }
}
