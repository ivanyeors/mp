import Stripe from "stripe";

let _stripe: Stripe | null = null;

const STRIPE_API_VERSION = "2026-11-18.endive";

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return _stripe;
}
