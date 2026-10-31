import type Stripe from "stripe";
import { getStripe } from "./client";

interface RefundOpts {
  /** PaymentIntent id (`pi_...`) to refund — i.e. the order's payment_reference. */
  paymentIntentId: string;
  /**
   * Partial-refund amount in major units (e.g. dollars). Omit for a full
   * refund. Converted to the smallest currency unit before sending to Stripe.
   */
  amount?: number;
  /**
   * Required idempotency key (e.g. `refund_${orderId}_${cents}`) so a retried or
   * double-submitted admin refund never moves money twice.
   */
  idempotencyKey: string;
  reason?: Stripe.RefundCreateParams.Reason;
  /** Persisted on the Stripe Refund so the webhook can link it back to an order. */
  metadata?: Record<string, string>;
}

/**
 * Issue a refund against a PaymentIntent. The Stripe Refund is the source of
 * truth; callers (Slice 08 admin refund route) let the `charge.refunded` /
 * `refund.*` webhook write the money-ledger row rather than recording it here.
 */
export async function refundPayment(opts: RefundOpts): Promise<Stripe.Refund> {
  const stripe = getStripe();

  const params: Stripe.RefundCreateParams = {
    payment_intent: opts.paymentIntentId,
    ...(opts.amount != null ? { amount: Math.round(opts.amount * 100) } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  return stripe.refunds.create(params, { idempotencyKey: opts.idempotencyKey });
}

/**
 * What Stripe will still refund on each intent's charge, in cents: captured
 * less every refund it holds, pending ones included, which the money ledger
 * only learns of once they settle.
 */
export async function intentRefundableBalances(
  paymentIntentIds: string[],
): Promise<Array<{ paymentIntentId: string; refundableCents: number }>> {
  const stripe = getStripe();
  return Promise.all(
    paymentIntentIds.map(async (paymentIntentId) => {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      const refundableCents = charge ? Math.max(0, charge.amount_captured - charge.amount_refunded) : 0;
      return { paymentIntentId, refundableCents };
    }),
  );
}
