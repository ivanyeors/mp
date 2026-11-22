import type Stripe from "stripe";
import { getStripe } from "./client";

interface RefundOpts {
  paymentIntentId: string;
  amount?: number;
  idempotencyKey: string;
  reason?: Stripe.RefundCreateParams.Reason;
  metadata?: Record<string, string>;
}

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

export async function intentPaymentMethodType(paymentIntentId: string): Promise<string | null> {
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  return charge?.payment_method_details?.type ?? null;
}
