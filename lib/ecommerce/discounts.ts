import { supabaseAdmin } from "@/lib/supabase/server";
import { OPEN_CHECKOUT_WINDOW_MS } from "@/lib/stripe/checkout-lifetime";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import type { Coupon } from "@/lib/types/ecommerce";
import { computeCouponDiscountAmount } from "@/lib/ecommerce/coupon-math";

export { computeCouponDiscountAmount };

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

/** The signed-in shopper's Customer, from the session. */
export type CouponAccount = { customerId: string; email: string };

export interface ValidateCouponOptions {
  /** The email typed at checkout. */
  customerEmail?: string;
  /**
   * The signed-in shopper's Customer, from the session (never a request
   * body). A coupon with a per-customer limit, or bound to one Customer, is
   * usable only with it, checking out under its own email.
   */
  account?: CouponAccount | null;
  lineItems?: CouponLineItem[];
  /**
   * Results that must not count as a use of the coupon: the one being
   * (re)submitted, which is about to carry it.
   */
  excludeResultIds?: string[];
}

/** Longest code worth a database round trip. Admin codes are capped at 100. */
export const COUPON_CODE_MAX_LENGTH = 100;

/**
 * Result statuses that still hold a coupon: submitted, not yet an Order. Their
 * use is counted at Accept, when the Order is paid; until then they count here,
 * or one limited code could be held by any number of customisations.
 */
const LIVE_RESULT_STATUSES = ["held", "assigned", "accepted"];

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
        error: "This code doesn't apply to these items",
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
      error: "This code doesn't apply to these items",
    };
  }
  if (hasCategoryScope && cIds.length === 0) {
    return {
      eligible: false,
      discountBase: 0,
      error: "This code doesn't apply to these items",
    };
  }
  const productMatch = hasProductScope && pIds.some((id) => product_ids!.includes(id));
  const categoryMatch = hasCategoryScope && cIds.some((id) => category_ids!.includes(id));
  if (!productMatch && !categoryMatch) {
    return {
      eligible: false,
      discountBase: 0,
      error: "This code doesn't apply to these items",
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
  options: { customerEmail?: string; customerId?: string },
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

/** How many distinct orders two lookups found between them. */
async function distinctOrderCount(
  lookups: Array<PromiseLike<{ data: Array<{ id: string }> | null }>>,
): Promise<number> {
  const results = await Promise.all(lookups);
  return new Set(results.flatMap((r) => (r.data ?? []).map((row) => row.id))).size;
}

/**
 * The account's paid, non-cancelled orders with this coupon: by its Customer,
 * and by its email for guest orders placed under that address before.
 */
async function fetchCustomerCouponUseCount(couponId: string, account: CouponAccount): Promise<number> {
  const paid = () =>
    supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("coupon_id", couponId)
      .neq("status", "cancelled")
      .not("paid_at", "is", null);
  return distinctOrderCount([
    paid().eq("customer_id", account.customerId),
    paid().ilike("email", escapeLikePattern(account.email.toLowerCase().trim())),
  ]);
}

/** Why a per-customer or account-bound code was refused to a guest. */
export const COUPON_SIGN_IN_ERROR = "Sign in with your account email to use this code";

/**
 * Shop orders carrying this coupon whose Checkout is still open: unpaid,
 * pending, and younger than a Checkout Session (one hour). Each can still be paid, so
 * each counts against the limit; otherwise N checkouts opened before paying
 * any all pass a usage_limit = 1 check.
 */
async function fetchPendingOrderCouponUseCount(couponId: string, account?: CouponAccount): Promise<number> {
  const open = () =>
    supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("coupon_id", couponId)
      .eq("status", "pending")
      .is("paid_at", null)
      .gte("created_at", new Date(Date.now() - OPEN_CHECKOUT_WINDOW_MS).toISOString());
  if (!account) return distinctOrderCount([open()]);
  return distinctOrderCount([
    open().eq("customer_id", account.customerId),
    open().ilike("email", escapeLikePattern(account.email.toLowerCase().trim())),
  ]);
}

/**
 * Customisations carrying this coupon that have not become an Order yet. Only
 * Results that really entered the money path count: a card authorised
 * (`payment_intent_id`), or submitted with no card at all (`authorized_amount`
 * null — an Assisted customisation, or holds switched off). A Checkout opened
 * and abandoned holds nothing, so it cannot use up a code nobody paid with.
 */
async function fetchLiveResultCouponUseCount(
  couponId: string,
  options: Pick<ValidateCouponOptions, "customerEmail" | "excludeResultIds">,
): Promise<number> {
  const admin = supabaseAdmin();
  const live = () => {
    let query = admin
      .from("mp_config_responses")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", couponId)
      .in("status", LIVE_RESULT_STATUSES)
      .is("order_id", null);
    for (const id of options.excludeResultIds ?? []) query = query.neq("id", id);
    if (options.customerEmail) {
      query = query.ilike("customer_email", escapeLikePattern(options.customerEmail.toLowerCase().trim()));
    }
    return query;
  };
  const [authorised, noCard] = await Promise.all([
    live().not("payment_intent_id", "is", null),
    live().is("payment_intent_id", null).is("authorized_amount", null),
  ]);
  return (authorised.count ?? 0) + (noCard.count ?? 0);
}

/**
 * The active coupon with exactly this code, or null. Exact match: every write
 * (POST/PATCH /api/shop/coupons) stores the code upper-cased, and `ilike` would
 * read `%`/`_` in the input as wildcards.
 */
export async function findActiveCoupon(code: string): Promise<Coupon | null> {
  const normalized = code.toUpperCase().trim();
  if (!normalized || normalized.length > COUPON_CODE_MAX_LENGTH) return null;
  const { data, error } = await supabaseAdmin()
    .from("coupons")
    .select("*")
    .eq("is_active", true)
    .eq("code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return data as Coupon;
}

export async function validateCoupon(
  code: string,
  subtotal: number,
  productIds?: string[],
  categoryIds?: string[],
  options?: ValidateCouponOptions,
): Promise<CouponValidationResult> {
  const coupon = await findActiveCoupon(code);
  if (!coupon) {
    return { valid: false, error: "This code isn't valid" };
  }
  return checkCoupon(coupon, subtotal, productIds, categoryIds, options);
}

/** Whether a coupon already found applies to this order, and what it takes off. */
export async function checkCoupon(
  coupon: Coupon,
  subtotal: number,
  productIds?: string[],
  categoryIds?: string[],
  options?: ValidateCouponOptions,
): Promise<CouponValidationResult> {
  const now = new Date();

  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, error: "This code isn't active yet" };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, error: "This code has expired" };
  }

  // A code limited per customer, or bound to one Customer (a Welcome-back
  // voucher), is counted per account, so it needs the account: signed in and
  // checking out under its own email. Counted by typed email, a new address
  // was a new customer.
  const account = options?.account ?? null;
  if (coupon.per_customer_limit !== null || coupon.customer_id) {
    const typed = options?.customerEmail?.trim().toLowerCase();
    if (!account || (typed && typed !== account.email.trim().toLowerCase())) {
      return { valid: false, error: COUPON_SIGN_IN_ERROR };
    }
    // Someone else's voucher reads exactly like a code that does not exist.
    if (coupon.customer_id && coupon.customer_id !== account.customerId) {
      return { valid: false, error: "This code isn't valid" };
    }
  }

  if (coupon.usage_limit !== null) {
    const [held, pending] = await Promise.all([
      fetchLiveResultCouponUseCount(coupon.id, { excludeResultIds: options?.excludeResultIds }),
      fetchPendingOrderCouponUseCount(coupon.id),
    ]);
    if (coupon.usage_count + held + pending >= coupon.usage_limit) {
      return { valid: false, error: "This code has been fully redeemed" };
    }
  }

  if (coupon.per_customer_limit !== null && account) {
    const [paid, held, pending] = await Promise.all([
      fetchCustomerCouponUseCount(coupon.id, account),
      fetchLiveResultCouponUseCount(coupon.id, {
        customerEmail: account.email,
        excludeResultIds: options?.excludeResultIds,
      }),
      fetchPendingOrderCouponUseCount(coupon.id, account),
    ]);
    if (exceedsPerCustomerLimit(paid + held + pending, coupon.per_customer_limit)) {
      return { valid: false, error: "You've already used this code as many times as it allows" };
    }
  }

  if (coupon.min_order_amount !== null && subtotal < coupon.min_order_amount) {
    return {
      valid: false,
      error: `This code needs an order of at least ${coupon.currency} ${Number(coupon.min_order_amount).toFixed(2)}`,
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
    return { valid: false, error: scope.error ?? "This code doesn't apply to these items" };
  }

  const discountAmount = computeCouponDiscountAmount(coupon, scope.discountBase);
  return { valid: true, coupon, discount_amount: discountAmount };
}

/**
 * Counts one redemption of a paid order's coupon. False means the coupon was
 * already used up (its limit was reached by orders paid while this one sat in
 * Checkout): the caller flags the order. Never pushes the count past the limit.
 */
export async function incrementCouponUsage(couponId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("increment_coupon_usage_capped", { p_coupon_id: couponId });
  if (!error) return data === true;

  // Until migration 20261025130000 is applied: the old unconditional count.
  const { error: legacyError } = await admin.rpc("increment_coupon_usage", { coupon_id: couponId });
  if (legacyError) throw new Error(`Coupon usage not counted for ${couponId}: ${legacyError.message}`);
  return true;
}

/** Takes one redemption back on a full refund, never below zero, atomically. */
export async function decrementCouponUsage(couponId: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("decrement_coupon_usage", { p_coupon_id: couponId });
  if (error) throw new Error(`Coupon usage not decremented for ${couponId}: ${error.message}`);
}
