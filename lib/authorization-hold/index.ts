/** Stripe authorization hold: manual-capture PaymentIntent create / capture / release. */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import { pairAuthorized } from "@/lib/results/paired-build";

export function toStripeAmountCents(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/**
 * Attach a completed hold Checkout's payment intent to its Result. The ONE
 * writer for both the Stripe webhook and the status page's return-from-Stripe
 * sync, so neither can skip a check the other makes.
 *
 * A re-submitted build opens a new Checkout without expiring the old one, so an
 * Owner can still pay the OLD session. Its card must not land on a Result now
 * quoting a different amount: capture would fail or under-charge. Written only
 * onto a `held` Result with no intent yet, so a card already attached — or a
 * Result that moved on — is never replaced.
 *
 * `mismatch` explains a refusal worth recording; `null` means nothing to attach.
 */
export async function attachHoldPaymentIntent(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: true; paymentIntentId: string } | { ok: false; mismatch: string | null }> {
  const resultId = session.metadata?.result_id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  // `complete`, not `payment_status`: a manual-capture hold reads `unpaid` until capture.
  if (!resultId || !paymentIntentId || session.status !== "complete") {
    return { ok: false, mismatch: null };
  }

  // Read and write errors throw: the webhook answers 500 and Stripe retries,
  // rather than an authorised card ending up attached to nothing.
  const { data: held, error: heldError } = await admin
    .from("mp_config_responses")
    .select("authorized_amount, currency, paired_build_id")
    .eq("id", resultId)
    .eq("status", "held")
    .is("payment_intent_id", null)
    .maybeSingle();
  if (heldError) throw new Error(`Hold attach read failed for ${resultId}: ${heldError.message}`);
  if (!held) return { ok: false, mismatch: null };

  // A Paired build's one Checkout authorised both Results (ADR 0026): it must
  // match the anchor's quote plus the companion it named, and its intent is
  // written onto both. The companion counts whatever has become of it since —
  // Staff cancelling it before Checkout completed must not void the Mpillow's
  // card — but only a companion still waiting for one takes the intent.
  let memberIds = [resultId];
  let quoted = held.authorized_amount == null ? null : Number(held.authorized_amount);
  if (held.paired_build_id === resultId && !session.metadata?.paired_result_id) {
    // A session that does not name its companion: it authorised the members
    // still waiting for a card.
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
    // Deleted since: the session still carries what it authorised for it.
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
  /**
   * One line per product when a Paired build is held together (ADR 0026); they
   * must sum to `amount`. Omitted, the Checkout shows one line for the whole hold.
   */
  lines?: Array<{ name: string; amount: number }>;
};

const HOLD_LINE_NOTE =
  "Card authorization only — you are not charged until you accept the final build.";

/** Hosted Checkout that creates a manual-capture PaymentIntent. */
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

// The settlement split lives in its own module: it is pure, and the "build
// updated" email needs it without loading the Stripe SDK this file pulls in.
export { planCapture, type CapturePlan } from "./settlement-plan";

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
