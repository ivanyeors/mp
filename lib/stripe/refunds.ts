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
