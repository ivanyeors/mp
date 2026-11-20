import type Stripe from "stripe";

export function stripeTime(seconds: number | null | undefined): string {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

export function stripeEventTime(event: Pick<Stripe.Event, "created">): string {
  return stripeTime(event.created);
}

export async function paymentIntentCapturedAt(
  stripe: Pick<Stripe, "paymentIntents">,
  paymentIntentId: string,
): Promise<string | null> {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string" || !charge.captured) return null;
    const bt = charge.balance_transaction;
    if (bt && typeof bt !== "string") return stripeTime(bt.created);
    return intent.capture_method !== "manual" ? stripeTime(charge.created) : null;
  } catch {
    return null;
  }
}
