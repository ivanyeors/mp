import { supabaseAdmin } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import type { Coupon } from "@/lib/types/ecommerce";

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  error?: string;
  discount_amount?: number;
}

export interface CouponLineItem {
  productId: string;
  categoryId?: string | null;
  lineTotal: number;
}

export interface ValidateCouponOptions {
  customerEmail?: string;
  customerId?: string;
  lineItems?: CouponLineItem[];
}

/** Pure discount math — testable without DB. */
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

/** Resolve which subtotal the coupon applies to (full cart vs scoped items). */
export function resolveCouponDiscountBase(
  subtotal: number,
  appliesTo: Coupon["applies_to"],
  productIds?: string[],
  categoryIds?: string[],
  lineItems?: CouponLineItem[],
): { eligible: boolean; discountBase: number; error?: string } {
  if (!appliesTo) return { eligible: true, discountBase: subtotal };

  const { product_ids, category_ids } = appliesTo;
  const hasProductScope = Boolean(product_ids?.length);
  const hasCategoryScope = Boolean(category_ids?.length);
  if (!hasProductScope && !hasCategoryScope) {
    return { eligible: true, discountBase: subtotal };
  }

  if (lineItems?.length) {
    const eligibleItems = lineItems.filter((item) => {
      if (hasProductScope && product_ids!.includes(item.productId)) return true;
      if (hasCategoryScope && item.categoryId && category_ids!.includes(item.categoryId)) {
        return true;
      }
      return false;
    });
    if (eligibleItems.length === 0) {
      return {
        eligible: false,
        discountBase: 0,
        error: "Coupon does not apply to items in your cart",
      };
    }
    return {
      eligible: true,
      discountBase: eligibleItems.reduce((sum, item) => sum + item.lineTotal, 0),
    };
  }

  const pIds = productIds ?? [];
  const cIds = categoryIds ?? [];
  if (hasProductScope && pIds.length === 0) {
    return {
      eligible: false,
      discountBase: 0,
      error: "Coupon does not apply to items in your cart",
    };
  }
  if (hasCategoryScope && cIds.length === 0) {
    return {
      eligible: false,
      discountBase: 0,
      error: "Coupon does not apply to items in your cart",
    };
  }
  const productMatch = hasProductScope && pIds.some((id) => product_ids!.includes(id));
  const categoryMatch = hasCategoryScope && cIds.some((id) => category_ids!.includes(id));
  if (!productMatch && !categoryMatch) {
    return {
      eligible: false,
      discountBase: 0,
      error: "Coupon does not apply to items in your cart",
    };
  }
  return { eligible: true, discountBase: subtotal };
}

export type CouponUseOrder = {
  coupon_id: string | null;
  customer_id: string | null;
  email: string;
  status: string;
  paid_at: string | null;
};

/** Pure — prior paid, non-cancelled orders using this coupon for the customer. */
export function countCustomerCouponUses(
  orders: CouponUseOrder[],
  couponId: string,
  options: Pick<ValidateCouponOptions, "customerEmail" | "customerId">,
): number {
  if (!options.customerEmail && !options.customerId) return 0;

  const normalizedEmail = options.customerEmail?.toLowerCase().trim();

  return orders.filter((order) => {
    if (order.coupon_id !== couponId) return false;
    if (order.status === "cancelled") return false;
    if (!order.paid_at) return false;
    if (options.customerId) return order.customer_id === options.customerId;
    if (normalizedEmail) return order.email.toLowerCase() === normalizedEmail;
    return false;
  }).length;
}

export function exceedsPerCustomerLimit(uses: number, perCustomerLimit: number | null): boolean {
  return perCustomerLimit !== null && uses >= perCustomerLimit;
}

async function fetchCustomerCouponUseCount(
  couponId: string,
  options: Pick<ValidateCouponOptions, "customerEmail" | "customerId">,
): Promise<number> {
  if (!options.customerEmail && !options.customerId) return 0;

  const admin = supabaseAdmin();
  let query = admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .neq("status", "cancelled")
    .not("paid_at", "is", null);

  if (options.customerId) {
    query = query.eq("customer_id", options.customerId);
  } else if (options.customerEmail) {
    query = query.ilike("email", escapeLikePattern(options.customerEmail.toLowerCase().trim()));
  }

  const { count } = await query;
  return count ?? 0;
}

export async function validateCoupon(
  code: string,
  subtotal: number,
  productIds?: string[],
  categoryIds?: string[],
  options?: ValidateCouponOptions,
): Promise<CouponValidationResult> {
  const admin = supabaseAdmin();
  const normalized = code.toUpperCase().trim();

  // Exact match: every write (POST/PATCH /api/shop/coupons) stores the code
  // upper-cased. `ilike` would read `%`/`_` in the input as wildcards.
  const { data, error } = await admin
    .from("coupons")
    .select("*")
    .eq("is_active", true)
    .eq("code", normalized)
    .single();

  if (error || !data) {
    return { valid: false, error: "Invalid coupon code" };
  }

  const coupon = data as Coupon;
  const now = new Date();

  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, error: "Coupon is not yet active" };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, error: "Coupon has expired" };
  }

  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, error: "Coupon usage limit reached" };
  }

  if (coupon.per_customer_limit !== null && (options?.customerEmail || options?.customerId)) {
    const uses = await fetchCustomerCouponUseCount(coupon.id, options);
    if (exceedsPerCustomerLimit(uses, coupon.per_customer_limit)) {
      return { valid: false, error: "You have already used this coupon the maximum number of times" };
    }
  }

  if (coupon.min_order_amount !== null && subtotal < coupon.min_order_amount) {
    return {
      valid: false,
      error: `Minimum order amount is ${coupon.currency} ${coupon.min_order_amount.toFixed(2)}`,
    };
  }

  const scope = resolveCouponDiscountBase(
    subtotal,
    coupon.applies_to,
    productIds,
    categoryIds,
    options?.lineItems,
  );
  if (!scope.eligible) {
    return { valid: false, error: scope.error ?? "Coupon does not apply to items in your cart" };
  }

  const discountAmount = computeCouponDiscountAmount(coupon, scope.discountBase);
  return { valid: true, coupon, discount_amount: discountAmount };
}

export async function incrementCouponUsage(couponId: string) {
  const admin = supabaseAdmin();
  const { error } = await admin.rpc("increment_coupon_usage", { coupon_id: couponId });
  if (!error) return;

  // ponytail: fallback when RPC not yet migrated — read-modify-write
  const { data } = await admin.from("coupons").select("usage_count").eq("id", couponId).single();
  if (data) {
    await admin.from("coupons").update({ usage_count: data.usage_count + 1 }).eq("id", couponId);
  }
}
