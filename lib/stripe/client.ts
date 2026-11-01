import Stripe from "stripe";

let _stripe: Stripe | null = null;

// Pin the Stripe API version so SDK upgrades / account-default changes don't
// silently alter request/response shapes. Must match the version bundled by the
// installed `stripe` SDK (its `apiVersion` literal type), so bump both together.
const STRIPE_API_VERSION = "2026-09-30.endive";

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return _stripe;
}
