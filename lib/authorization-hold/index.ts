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

/** Capture up to the authorized amount (optional partial). Never pass amount > authorized. */
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

export type CapturePlan =
  | { kind: "capture"; amount: number }
  | { kind: "top_up"; holdCapture: number; topUp: number };

/**
 * Decide how to settle final vs authorized hold.
 * Never captures above authorized — excess requires a separate Balance payment.
 *
 * A Result with no Authorization hold passes `authorizedAmount = 0` and takes the
 * same branch for its whole total: a full payment is a top-up from a hold of zero
 * (ADR 0016). That keeps one settlement path rather than two.
 */
export function planCapture(finalAmount: number, authorizedAmount: number): CapturePlan {
  if (finalAmount <= 0) {
    throw new Error("final amount must be positive");
  }
  if (authorizedAmount <= 0) {
    return { kind: "top_up", holdCapture: 0, topUp: finalAmount };
  }
  if (finalAmount <= authorizedAmount) {
    return { kind: "capture", amount: finalAmount };
  }
  return {
    kind: "top_up",
    holdCapture: authorizedAmount,
    topUp: Math.round((finalAmount - authorizedAmount) * 100) / 100,
  };
}

export type CreateTopUpCheckoutInput = {
  amount: number;
  /**
   * What is being captured from an Authorization hold alongside this payment.
   * Zero means there is no hold and this Checkout is the entire price, which
   * changes only the customer-facing wording — the Stripe call is identical.
   */
  holdCapture?: number;
  currency: string;
  customerEmail: string;
  resultId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
};

/** Immediate-capture Checkout for the amount above the authorization hold. */
export async function createTopUpCheckout(
  input: CreateTopUpCheckoutInput,
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
              name: input.holdCapture === 0 ? "Your custom build" : "Final build top-up",
              description:
                input.holdCapture === 0
                  ? "Payment in full for your custom build, as assigned by our team."
                  : "Additional charge because the final total exceeds your authorization hold.",
            },
          },
        },
      ],
      metadata: {
        ...(input.metadata ?? {}),
        result_id: input.resultId,
        purpose: "result_topup",
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (!session.url) throw new Error("Checkout session missing url");
  return { sessionId: session.id, url: session.url };
}
