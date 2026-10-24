/**
 * What the browser and the server agree on about the one checkout code field
 * (ADR 0033). Pure: the page imports this, never `./index`, which is server-only.
 */

/** Longer than any referral (12) or sensible discount code; refused unread. */
export const CHECKOUT_CODE_MAX_LENGTH = 64;

/** The order the code would go on, as POST /api/checkout/code reads it. */
export type CheckoutCodeContext =
  | {
      flow: "shop";
      subtotal: number;
      line_items: Array<{ product_id: string; line_total: number }>;
    }
  | {
      flow: "customisation";
      build:
        | { product_type: "pillow"; size: string; tier: string }
        | { product_type: "bolster"; length: string };
      goods: number;
    }
  /**
   * Nothing priced yet: an Assisted customisation's questionnaire, sent before
   * cover, case and shipping exist. The check says what kind of code it is and
   * whether it can be used at all; the amount comes once the build is priced.
   */
  | { flow: "none" };

export type CheckoutCodeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "referral"; code: string; partnerName: string }
  /** `discount` null: nothing priced yet to take it off (`flow: "none"`). */
  | { state: "discount"; code: string; discount: number | null; freeShipping: boolean }
  /** A discount code that exists but cannot be used on this order, and why. */
  | { state: "invalid"; code: string; reason: string }
  | { state: "unknown"; code: string }
  /** The check itself failed (offline, rate-limited); the server decides at pay. */
  | { state: "error"; message: string };

/** The discount the page may show, or 0. */
export function checkoutCodeDiscount(status: CheckoutCodeStatus): number {
  return status.state === "discount" ? (status.discount ?? 0) : 0;
}

export function checkoutCodeFreeShipping(status: CheckoutCodeStatus): boolean {
  return status.state === "discount" && status.freeShipping;
}

/**
 * The code to send with the order. One the check accepted, or one still being
 * checked (the server resolves it again either way, and a shopper who pays
 * before the check returns must not lose their referral or discount). Never one
 * the check turned down: the page told the shopper they can carry on without
 * it, so it must not then block the payment.
 */
export function checkoutCodeToSend(code: string, status: CheckoutCodeStatus): string | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return status.state === "invalid" || status.state === "unknown" ? undefined : trimmed;
}
