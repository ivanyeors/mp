import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { stripeTime } from "@/lib/stripe/money-time";
import type { StripePaymentOption } from "@/lib/staff-orders/shared";

export const STRIPE_PAYMENT_LOOKBACK_DAYS = 7;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const MAX_OPTIONS = 20;

export type WantedPayment = { amount: number; currency: string; orderId?: string };

const cents = (amount: number) => Math.round(amount * 100);
const money = (amountCents: number, currency: string) => `${currency.toUpperCase()} ${(amountCents / 100).toFixed(2)}`;

function chargeOf(intent: Stripe.PaymentIntent): Stripe.Charge | null {
  return intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;
}

export function unfitReason(intent: Stripe.PaymentIntent, want: WantedPayment): string | null {
  if (intent.status !== "succeeded") return "That Stripe payment has not gone through.";
  const currency = want.currency.toLowerCase();
  if (intent.currency !== currency) {
    return `That Stripe payment is in ${intent.currency.toUpperCase()}, and this order is in ${currency.toUpperCase()}.`;
  }
  if (intent.amount_received !== cents(want.amount)) {
    return `That Stripe payment is for ${money(intent.amount_received, intent.currency)}, and this order is ${money(cents(want.amount), currency)}.`;
  }
  const charge = chargeOf(intent);
  if (!charge) return "That Stripe payment has no charge to check.";
  if (charge.refunded || charge.amount_refunded > 0) return "That Stripe payment has been refunded.";
  if (charge.disputed) return "That Stripe payment is disputed.";
  const meta = intent.metadata ?? {};
  const ownOrder = Boolean(want.orderId) && meta.order_id === want.orderId;
  if (!ownOrder && (meta.order_id || meta.result_id || meta.purpose)) {
    return "That Stripe payment already belongs to another order or customisation on this site.";
  }
  return null;
}

function methodLabel(charge: Stripe.Charge | null): string | null {
  const details = charge?.payment_method_details;
  if (!details) return null;
  const card = details.card ?? details.card_present;
  if (card?.last4) return `${(card.brand ?? "card").replace(/^./, (c) => c.toUpperCase())} •••• ${card.last4}`;
  if (details.type === "paynow") return "PayNow";
  return details.type ? details.type.replace(/_/g, " ") : null;
}

export function toOption(intent: Stripe.PaymentIntent): StripePaymentOption {
  const charge = chargeOf(intent);
  return {
    id: intent.id,
    amount: intent.amount_received / 100,
    currency: intent.currency.toUpperCase(),
    paidAt: stripeTime(charge?.created ?? intent.created),
    method: methodLabel(charge),
    description: intent.description ?? null,
    email: intent.receipt_email ?? charge?.billing_details?.email ?? null,
  };
}

export async function claimedBy(admin: SupabaseClient, paymentIntentIds: string[]): Promise<Map<string, string>> {
  const claimed = new Map<string, string>();
  if (paymentIntentIds.length === 0) return claimed;
  const { data, error } = await admin
    .from("order_payments")
    .select("stripe_object_id, order_id")
    .in("stripe_object_id", paymentIntentIds);
  if (error) throw new Error(`Couldn't read the payments already recorded: ${error.message}`);
  for (const row of (data ?? []) as Array<{ stripe_object_id: string; order_id: string }>) {
    claimed.set(row.stripe_object_id, row.order_id);
  }
  return claimed;
}

// ponytail: reads up to MAX_PAGES x PAGE_SIZE payments from the last week and filters here, because
// Stripe's search lags a minute behind a payment just taken. Past ~70 payments a day, narrow the window.
export async function listMatchingStripePayments(
  admin: SupabaseClient,
  stripe: Pick<Stripe, "paymentIntents">,
  want: WantedPayment,
  now: Date = new Date(),
): Promise<StripePaymentOption[]> {
  const since = Math.floor(now.getTime() / 1000) - STRIPE_PAYMENT_LOOKBACK_DAYS * 24 * 60 * 60;
  const fits: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await stripe.paymentIntents.list({
      created: { gte: since },
      limit: PAGE_SIZE,
      expand: ["data.latest_charge"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const intent of batch.data) {
      if (unfitReason(intent, want) === null) fits.push(intent);
    }
    if (!batch.has_more || batch.data.length === 0) break;
    startingAfter = batch.data[batch.data.length - 1].id;
  }
  const claimed = await claimedBy(
    admin,
    fits.map((i) => i.id),
  );
  return fits
    .filter((i) => !claimed.has(i.id))
    .map(toOption)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, MAX_OPTIONS);
}
