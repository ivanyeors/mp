import { loadStripe, type Stripe } from "@stripe/stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

let stripePromise: Promise<Stripe | null> | null = null;

export function stripeJs(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  stripePromise ??= loadStripe(PUBLISHABLE_KEY).catch((err) => {
    console.warn("[stripe] Stripe.js did not load; checkout falls back to Stripe's page.", err);
    stripePromise = null;
    return null;
  });
  return stripePromise;
}
