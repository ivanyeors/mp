import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import { pairAuthorized } from "@/lib/results/paired-build";

export function toStripeAmountCents(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export async function attachHoldPaymentIntent(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: true; paymentIntentId: string } | { ok: false; mismatch: string | null }> {
  const resultId = session.metadata?.result_id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (!resultId || !paymentIntentId || session.status !== "complete") {
    return { ok: false, mismatch: null };
  }

  const { data: held, error: heldError } = await admin
    .from("mp_config_responses")
    .select("authorized_amount, currency, paired_build_id")
    .eq("id", resultId)
    .eq("status", "held")
    .is("payment_intent_id", null)
    .maybeSingle();
  if (heldError) throw new Error(`Hold attach read failed for ${resultId}: ${heldError.message}`);
  if (!held) return { ok: false, mismatch: null };

  let memberIds = [resultId];
  let quoted = held.authorized_amount == null ? null : Number(held.authorized_amount);
  if (held.paired_build_id === resultId && !session.metadata?.paired_result_id) {
    const { data: waiting, error: waitingError } = await admin
      .from("mp_config_responses")
      .select("id, authorized_amount")
      .eq("paired_build_id", resultId)
      .eq("status", "held")
      .is("payment_intent_id", null);
    if (waitingError) throw new Error(`Hold attach read failed for ${resultId}: ${waitingError.message}`);
    const members = waiting?.length ? waiting : [{ id: resultId, ...held }];
    quoted = pairAuthorized(members);
    memberIds = members.map((m) => String(m.id));
  } else if (held.paired_build_id === resultId) {
    const companionId = session.metadata?.paired_result_id ?? null;
    const { data: companion } = companionId
      ? await admin
          .from("mp_config_responses")
          .select("id, authorized_amount, status, payment_intent_id, paired_build_id")
          .eq("id", companionId)
          .maybeSingle()
      : { data: null };
    const ours = companion?.paired_build_id === resultId;
    const companionQuote = ours
      ? companion!.authorized_amount
      : session.metadata?.paired_result_amount ?? null;
    quoted = companionId ? pairAuthorized([held, { authorized_amount: companionQuote }]) : quoted;
    if (ours && companion!.status === "held" && companion!.payment_intent_id == null) {
      memberIds = [resultId, companionId!];
    }
  }
  if (
    quoted == null ||
    toStripeAmountCents(quoted) !== session.amount_total ||
    String(held.currency).toLowerCase() !== session.currency?.toLowerCase()
  ) {
    return {
      ok: false,
      mismatch:
        `Result ${resultId} hold session ${session.id} authorised ${session.currency} ` +
        `${session.amount_total}, but the Result quotes ${held.currency} ` +
        `${quoted}. Card not attached.`,
    };
  }

  const { data: written, error: writeError } = await admin
    .from("mp_config_responses")
    .update({ payment_intent_id: paymentIntentId })
    .in("id", memberIds)
    .eq("status", "held")
    .is("payment_intent_id", null)
    .select("id");
  if (writeError) throw new Error(`Hold attach write failed for ${resultId}: ${writeError.message}`);
  return written?.some((w) => w.id === resultId)
    ? { ok: true, paymentIntentId }
    : { ok: false, mismatch: null };
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
  lines?: Array<{ name: string; amount: number }>;
};

const HOLD_LINE_NOTE =
  "Card authorization only — you are not charged until you accept the final build.";

export async function createHoldCheckout(
  input: CreateHoldCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  if (
    input.lines &&
    input.lines.reduce((t, l) => t + toStripeAmountCents(l.amount), 0) !==
      toStripeAmountCents(input.amount)
  ) {
    throw new Error("Hold lines must add up to the hold amount");
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: input.customerEmail,
      line_items: (
        input.lines ?? [
          { name: input.description ?? "Mpillow customisation hold", amount: input.amount },
        ]
      ).map((line) => ({
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: toStripeAmountCents(line.amount),
          product_data: { name: line.name, description: HOLD_LINE_NOTE },
        },
      })),
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

export async function captureHold(paymentIntentId: string, amountMajor?: number) {
  const stripe = getStripe();
  return stripe.paymentIntents.capture(
    paymentIntentId,
    amountMajor != null
      ? { amount_to_capture: toStripeAmountCents(amountMajor) }
      : undefined,
  );
}

export async function releaseHold(paymentIntentId: string) {
  const stripe = getStripe();
  return stripe.paymentIntents.cancel(paymentIntentId);
}

export { planCapture, type CapturePlan } from "./settlement-plan";

export type CreateTopUpCheckoutInput = {
  amount: number;
  holdCapture?: number;
  currency: string;
  customerEmail: string;
  resultId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
};

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
