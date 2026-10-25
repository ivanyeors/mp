/**
 * The one optional code a shopper types at checkout (ADR 0033): a partner's
 * referral code or a discount code, in the same field, on shop checkout and on
 * the customisation contact step.
 *
 * A code is a referral code when an active partner owns it, otherwise a
 * discount code when an active coupon has it. Coupon codes that collide with a
 * partner code are refused when the coupon is saved, and a new referral code
 * skips any coupon's, so the order only matters for rows written before that
 * guard.
 *
 * Server only. The client asks POST /api/checkout/code, and every price is
 * worked out again where the money is taken: the shop checkout route, and the
 * hold and every repricing of a Result. Nothing the browser says about a
 * discount is ever charged.
 */
import { findActiveCoupon } from "@/lib/ecommerce/discounts";
import { getPartnerByReferralCode, type ReferralPartner } from "@/lib/referrals";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import type { Coupon } from "@/lib/types/ecommerce";
import { CHECKOUT_CODE_MAX_LENGTH } from "./shared";

export { CHECKOUT_CODE_MAX_LENGTH };

export type ResolvedCheckoutCode =
  | { kind: "referral"; partner: ReferralPartner }
  | { kind: "coupon"; coupon: Coupon }
  | { kind: "unknown" };

/** Trimmed and upper-cased, as both kinds of code are stored. */
export function normalizeCheckoutCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Null for a blank code: there is nothing to resolve. */
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

/**
 * Every endpoint that answers whether a code exists draws on this one
 * allowance per IP, so guessing codes through checkout or the hold costs the
 * same as guessing them through the check endpoint. A shopper types a code once
 * or twice and the page re-checks it as the order changes; 60 in ten minutes is
 * far above that.
 *
 * Counted in the shared store (lib/rate-limit.ts), so the allowance holds
 * across instances. It still keys on IP: codes worth protecting carry a usage
 * limit too.
 */
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
