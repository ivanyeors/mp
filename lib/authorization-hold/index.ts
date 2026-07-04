/** Stripe authorization hold: manual-capture PaymentIntent create / capture / release. */

import { getStripe } from "@/lib/stripe/client";

export function toStripeAmountCents(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export type CreateHoldInput = {
  amount: number;
  currency: string;
  customerEmail: string;
  metadata?: Record<string, string>;
  description?: string;
  idempotencyKey?: string;
};

export type CreateHoldResult = {
  paymentIntentId: string;
  clientSecret: string;
};

/** Create an uncaptured PaymentIntent (card authorized, not charged). */
export async function createHold(input: CreateHoldInput): Promise<CreateHoldResult> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create(
    {
      amount: toStripeAmountCents(input.amount),
      currency: input.currency.toLowerCase(),
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      receipt_email: input.customerEmail,
      description: input.description ?? "Customisation authorization hold",
      metadata: input.metadata ?? {},
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (!pi.client_secret) throw new Error("PaymentIntent missing client_secret");
  return { paymentIntentId: pi.id, clientSecret: pi.client_secret };
}

export type CreateHoldCheckoutInput = CreateHoldInput & {
  resultId: string;
  successUrl: string;
  cancelUrl: string;
};

/** Hosted Checkout that creates a manual-capture PaymentIntent. */
export async function createHoldCheckout(
  input: CreateHoldCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toStripeAmountCents(input.amount),
            product_data: {
              name: input.description ?? "Mpillow customisation hold",
              description: "Card authorization only — you are not charged until you accept the final build.",
            },
          },
        },
      ],
      payment_intent_data: {
        capture_method: "manual",
        metadata: { ...(input.metadata ?? {}), result_id: input.resultId },
      },
      metadata: { ...(input.metadata ?? {}), result_id: input.resultId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (!session.url) throw new Error("Checkout session missing url");
  return { sessionId: session.id, url: session.url };
}

/** Capture up to the authorized amount (optional partial). */
export async function captureHold(paymentIntentId: string, amountMajor?: number) {
  const stripe = getStripe();
  return stripe.paymentIntents.capture(
    paymentIntentId,
    amountMajor != null
      ? { amount_to_capture: toStripeAmountCents(amountMajor) }
      : undefined,
  );
}

/** Cancel / release an uncaptured hold. */
export async function releaseHold(paymentIntentId: string) {
  const stripe = getStripe();
  return stripe.paymentIntents.cancel(paymentIntentId);
}
