import { stripeMode, type StripeMode } from "./mode";

/**
 * Where a shop-cart shopper pays (ADR 0053).
 *
 * - `elements`: on our checkout page. The Checkout Session is created with
 *   `ui_mode: "elements"`, and the page mounts Stripe's Express Checkout
 *   Element (Apple Pay, Google Pay, Link) above the Payment Element (card,
 *   PayNow). Same Session, same metadata, same webhooks as hosted.
 * - `hosted`: Stripe's own page at checkout.stripe.com, as before. Apple Pay
 *   shows there too, but only after the shopper has left our site.
 *
 * The page asks for `elements` only once Stripe.js has loaded in its browser,
 * because an elements-mode Session has no hosted URL to fall back to.
 */
export type PaymentUi = "hosted" | "elements";

/** `pk_test_…` / `pk_live_…`; anything else is not a publishable key. */
function publishableKeyMode(key: string): StripeMode | null {
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return null;
}

/**
 * The publishable key the browser pays with, when it belongs to the same
 * account and mode as the secret key the server creates the Session with.
 * SERVER ONLY (it reads the secret key's mode).
 *
 * A sandbox publishable key cannot open a live Session's client secret, and
 * the reverse, so a mismatch is treated as no key at all: the shopper is sent
 * to the hosted page rather than shown a payment form that cannot load.
 */
export function onPagePublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!key) return null;
  return publishableKeyMode(key) === stripeMode() ? key : null;
}

/**
 * What the server actually does with what the page asked for. Only `elements`
 * is ever downgraded: to `hosted`, when this deploy has no usable publishable
 * key. An old checkout tab that sends nothing gets `hosted`, as it always did.
 */
export function resolvePaymentUi(requested: PaymentUi | undefined): PaymentUi {
  return requested === "elements" && onPagePublishableKey() ? "elements" : "hosted";
}
