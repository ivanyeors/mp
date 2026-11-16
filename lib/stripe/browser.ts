import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js for the on-page payment step (ADR 0053). Browser only.
 *
 * `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is inlined at build time. Blank, and
 * the checkout page never asks to pay on the page: every shopper goes to
 * Stripe's hosted page, as before. The server makes the same call from the
 * same variable (`lib/stripe/payment-ui.ts`) and also refuses a key from the
 * other mode.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * One Stripe.js per page, as Stripe requires: the Elements provider must get
 * the same instance every render. Resolves `null` when there is no key or the
 * script could not load (an ad blocker, a dropped connection), and then tries
 * again on the next call rather than caching the failure.
 */
export function stripeJs(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  stripePromise ??= loadStripe(PUBLISHABLE_KEY).catch((err) => {
    console.warn("[stripe] Stripe.js did not load; checkout falls back to Stripe's page.", err);
    stripePromise = null;
    return null;
  });
  return stripePromise;
}
