/**
 * When Stripe moved the money, by Stripe's clock.
 *
 * A sale happens when Stripe takes the payment, not when our webhook or Accept
 * gets round to recording it: Stripe retries a failed webhook for days, and a
 * customer who pays a Balance payment and closes the tab is settled whenever
 * Accept next runs. The money ledger keeps these times (`order_payments.occurred_at`)
 * and Analytics dates sales by them (ADR 0036).
 */

import type Stripe from "stripe";

/** A Stripe timestamp (seconds) as ISO; now when Stripe gave none. */
export function stripeTime(seconds: number | null | undefined): string {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

/** Stripe's time for an event: when the payment, refund or dispute it reports happened. */
export function stripeEventTime(event: Pick<Stripe.Event, "created">): string {
  return stripeTime(event.created);
}

/**
 * When a PaymentIntent's money was captured: its charge's balance transaction,
 * which Stripe creates at capture. A manual-capture charge is created when the
 * card is authorised, days before the capture, so the charge's own `created`
 * stands in only for an immediate-capture payment. `null` when Stripe has no
 * captured charge for it, or cannot be asked.
 */
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
