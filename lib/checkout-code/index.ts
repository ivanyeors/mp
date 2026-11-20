import { findActiveCoupon, type CouponAccount } from "@/lib/ecommerce/discounts";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { getPartnerByReferralCode, type ReferralPartner } from "@/lib/referrals";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import type { Coupon } from "@/lib/types/ecommerce";
import { CHECKOUT_CODE_MAX_LENGTH } from "./shared";

export { CHECKOUT_CODE_MAX_LENGTH };

export type ResolvedCheckoutCode =
  | { kind: "referral"; partner: ReferralPartner }
  | { kind: "coupon"; coupon: Coupon }
  | { kind: "unknown" };

export function normalizeCheckoutCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function resolveCheckoutCode(raw: string | null | undefined): Promise<ResolvedCheckoutCode | null> {
  const code = normalizeCheckoutCode(raw ?? "");
  if (!code) return null;
  if (code.length > CHECKOUT_CODE_MAX_LENGTH) return { kind: "unknown" };

  const partner = await getPartnerByReferralCode(code);
  if (partner) return { kind: "referral", partner };

  const coupon = await findActiveCoupon(code);
  if (coupon) return { kind: "coupon", coupon };

  return { kind: "unknown" };
}

export async function couponAccount(coupon: Coupon): Promise<CouponAccount | null> {
  if (coupon.per_customer_limit == null && !coupon.customer_id) return null;
  const user = await getAuthUser();
  if (!user?.email) return null;
  try {
    const customer = await linkCustomerToAuthUser(user);
    return { customerId: customer.id, email: customer.email };
  } catch {
    return null;
  }
}

export function checkoutCodeRateLimited(req: Request): Promise<boolean> {
  return rateLimitExceeded({
    bucket: "checkout-code",
    key: clientIp(req),
    windowMs: 10 * 60 * 1000,
    max: 60,
  });
}

export const CHECKOUT_CODE_RATE_LIMITED_MESSAGE =
  "Too many code attempts. Please wait a few minutes and try again.";
