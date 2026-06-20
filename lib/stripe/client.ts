import Stripe from "stripe";

let _stripe: Stripe | null = null;

// Pin the Stripe API version so SDK upgrades / account-default changes don't
// silently alter request/response shapes. Keep this in sync with the version
// bundled by the installed `stripe` SDK (Stripe.LatestApiVersion) and the
// default in the Stripe Dashboard when upgrading.
const STRIPE_API_VERSION = "2026-02-25.clover";

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return _stripe;
}
