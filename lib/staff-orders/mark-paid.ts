import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { updateCustomerStats } from "@/lib/ecommerce/customers";
import { incrementCouponUsage } from "@/lib/ecommerce/discounts";
import { deductInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { sendOrderConfirmedEmails } from "@/lib/email";
import { scheduleAutoLabel } from "@/lib/shipping/schedule-labels";
import { getStripe } from "@/lib/stripe/client";
import { paymentIntentCapturedAt, stripeTime } from "@/lib/stripe/money-time";
import { loadPayLinkRow } from "@/lib/staff-orders/link";
import { OUTSIDE_STRIPE_METHOD_LABELS, OUTSIDE_STRIPE_SOURCE } from "@/lib/ecommerce/outside-stripe";
import { PAYABLE_STATUSES, type PaidHow } from "@/lib/staff-orders/shared";
import { claimedBy, unfitReason } from "@/lib/staff-orders/stripe-payments";

export type MarkPaidActor = { userId: string; email: string };

export type MarkPaidOutcome =
  | { ok: true; paidAt: string; method: string; warnings: string[] }
  | { ok: false; status: number; error: string };

const ORDER_COLUMNS =
  "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, points_spent, total, status, paid_at, payment_method, payment_reference, coupon_id, customer_id, shipping_address, stripe_session_id, order_items(*)";

type OrderRow = {
  id: string;
  order_number: string;
  email: string;
  currency: string | null;
  subtotal: number;
  shipping_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  coupon_id: string | null;
  customer_id: string | null;
  stripe_session_id: string | null;
  shipping_address: { recipient?: string } | null;
  order_items: Array<{
    variant_id: string;
    quantity: number;
    product_title: string;
    variant_title: string | null;
    total_price: number;
    kind: string | null;
  }> | null;
};

const refuse = (status: number, error: string): MarkPaidOutcome => ({ ok: false, status, error });

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function flag(admin: SupabaseClient, orderId: string, eventType: string, detail: string, warnings: string[]) {
  warnings.push(detail);
  await admin.from("orders").update({ needs_attention: true }).eq("id", orderId);
  await addOrderTimelineEvent(orderId, eventType, detail, {}).catch((err) =>
    console.error(`[staff-order] Could not note "${eventType}" on ${orderId}:`, err),
  );
}

type Payment = {
  paidAt: string;
  method: string;
  reference: string | null;
  ledgerMetadata: Record<string, unknown>;
  timeline: string;
};

async function stripePayment(
  admin: SupabaseClient,
  stripe: Stripe,
  order: OrderRow,
  paymentIntentId: string,
  actor: MarkPaidActor,
): Promise<Payment | MarkPaidOutcome> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  } catch (err) {
    return refuse(502, `Stripe could not find that payment: ${errorText(err)}`);
  }
  const unfit = unfitReason(intent, { amount: Number(order.total), currency: order.currency ?? "SGD", orderId: order.id });
  if (unfit) return refuse(409, unfit);
  const claimedByOrder = (await claimedBy(admin, [intent.id])).get(intent.id);
  if (claimedByOrder && claimedByOrder !== order.id) {
    return refuse(409, "That Stripe payment is already recorded on another order.");
  }
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const paidAt = (await paymentIntentCapturedAt(stripe, intent.id)) ?? stripeTime(charge?.created ?? intent.created);
  return {
    paidAt,
    method: "stripe",
    reference: intent.id,
    ledgerMetadata: { source: "staff_mark_paid", marked_by: actor.email },
    timeline: `Marked paid by ${actor.email}: Stripe payment ${intent.id}.`,
  };
}

function outsidePayment(how: Extract<PaidHow, { kind: "outside" }>, actor: MarkPaidActor, now: Date): Payment {
  const label = OUTSIDE_STRIPE_METHOD_LABELS[how.method];
  return {
    paidAt: now.toISOString(),
    method: how.method,
    reference: null,
    ledgerMetadata: {
      source: OUTSIDE_STRIPE_SOURCE,
      method: how.method,
      note: how.note ?? null,
      marked_by: actor.email,
    },
    timeline: `Marked paid by ${actor.email}, outside Stripe: ${label}.${how.note ? ` Note: ${how.note}` : ""}`,
  };
}

async function closeOpenCheckout(
  order: OrderRow,
  how: PaidHow,
  stripe: () => Stripe,
): Promise<MarkPaidOutcome | null> {
  if (!order.stripe_session_id) return null;
  try {
    const session = await stripe().checkout.sessions.retrieve(order.stripe_session_id);
    if (session.status === "complete") {
      const paidWith = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (how.kind === "stripe" && paidWith === how.payment_intent_id) return null;
      return refuse(409, "This order was just paid through its payment link. Refresh the page.");
    }
    if (session.status === "open") await stripe().checkout.sessions.expire(order.stripe_session_id);
    return null;
  } catch (err) {
    console.error(`[staff-order] Could not close the Checkout for ${order.id}:`, err);
    return refuse(502, "Could not close this order's open Stripe Checkout, so it was not marked paid. Try again in a moment.");
  }
}

export async function markStaffOrderPaid(
  admin: SupabaseClient,
  orderId: string,
  how: PaidHow,
  actor: MarkPaidActor,
  now: Date = new Date(),
): Promise<MarkPaidOutcome> {
  const link = await loadPayLinkRow(admin, orderId);
  if (!link) return refuse(404, "Only an order Staff made can be marked paid.");

  const { data, error } = await admin.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) return refuse(500, error.message);
  if (!data) return refuse(404, "Order not found");
  const order = data as unknown as OrderRow;
  if (order.paid_at) return refuse(409, "This order is already paid.");
  if (!PAYABLE_STATUSES.has(order.status)) {
    return refuse(409, `This order is ${order.status.replace(/_/g, " ")}, so it can't be marked paid.`);
  }

  let stripeClient: Stripe | null = null;
  const stripe = () => (stripeClient ??= getStripe());

  let payment: Payment;
  if (how.kind === "stripe") {
    let client: Stripe;
    try {
      client = stripe();
    } catch {
      return refuse(503, "Stripe isn't connected here, so a Stripe payment can't be checked.");
    }
    const checked = await stripePayment(admin, client, order, how.payment_intent_id, actor);
    if ("ok" in checked) return checked;
    payment = checked;
  } else {
    payment = outsidePayment(how, actor, now);
  }

  const stillOpen = await closeOpenCheckout(order, how, stripe);
  if (stillOpen) return stillOpen;

  const before = {
    status: order.status,
    payment_method: order.payment_method,
    payment_reference: order.payment_reference,
  };
  const { data: confirmed, error: confirmError } = await admin
    .from("orders")
    .update({
      status: "confirmed",
      paid_at: payment.paidAt,
      payment_method: payment.method,
      payment_reference: payment.reference,
    })
    .eq("id", orderId)
    .is("paid_at", null)
    .in("status", [...PAYABLE_STATUSES])
    .select("id");
  if (confirmError) return refuse(500, confirmError.message);
  if (!confirmed?.length) return refuse(409, "This order changed while you were marking it paid. Refresh the page.");

  const undo = async (status: number, message: string): Promise<MarkPaidOutcome> => {
    const { error: undoError } = await admin
      .from("orders")
      .update({ ...before, paid_at: null })
      .eq("id", orderId)
      .eq("paid_at", payment.paidAt);
    if (undoError) console.error(`[staff-order] Could not undo marking ${orderId} paid:`, undoError.message);
    return refuse(status, message);
  };

  let recorded: boolean;
  try {
    ({ recorded } = await recordLedgerEntry(admin, orderId, {
      type: "charge",
      amount: Number(order.total),
      currency: order.currency ?? "SGD",
      stripeObjectId: payment.reference,
      metadata: payment.ledgerMetadata,
      occurredAt: payment.paidAt,
    }));
  } catch (err) {
    return undo(500, `The payment could not be recorded, so the order was not marked paid: ${errorText(err)}`);
  }
  if (!recorded && payment.reference) {
    const owner = (await claimedBy(admin, [payment.reference])).get(payment.reference);
    if (owner !== orderId) return undo(409, "That Stripe payment is already recorded on another order.");
  }
  await rollupOrderMoney(admin, orderId);

  const warnings: string[] = [];

  const { data: claimed, error: claimError } = await admin
    .from("orders")
    .update({ inventory_deducted_at: now.toISOString() })
    .eq("id", orderId)
    .is("inventory_deducted_at", null)
    .select("id");
  if (claimError) {
    await flag(admin, orderId, "oversold", `Marked paid, but its stock was not taken out: ${claimError.message}`, warnings);
  } else if (claimed?.length) {
    try {
      await deductInventoryForOrder(orderId, order.order_items ?? [], admin);
    } catch (err) {
      await admin.from("orders").update({ inventory_deducted_at: null }).eq("id", orderId);
      await flag(admin, orderId, "oversold", `Marked paid, but it could not be fulfilled from stock: ${errorText(err)}`, warnings);
    }
  }

  if (order.coupon_id) {
    const counted = await incrementCouponUsage(order.coupon_id).catch((err) => {
      console.error(`[staff-order] Coupon usage increment failed for ${orderId}:`, err);
      return true;
    });
    if (!counted) {
      await flag(admin, orderId, "coupon_limit_reached", "This order used a coupon that had already reached its usage limit.", warnings);
    }
  }

  if (order.customer_id) {
    await updateCustomerStats(order.customer_id).catch((err) =>
      console.error(`[staff-order] Customer stats update failed for ${orderId}:`, err),
    );
  }

  await addOrderTimelineEvent(orderId, "payment_confirmed", payment.timeline, {
    source: "staff_mark_paid",
    marked_by: actor.email,
    payment_method: payment.method,
    payment_intent: payment.reference,
  }).catch((err) => console.error(`[staff-order] Could not note the payment on ${orderId}:`, err));

  try {
    await sendOrderConfirmedEmails(orderId, { ...order, currency: order.currency ?? "SGD", paid_at: payment.paidAt }, admin);
  } catch (err) {
    console.error(`[staff-order] Order emails failed for ${orderId}:`, err);
    warnings.push("Marked paid, but the confirmation email could not be sent.");
  }

  scheduleAutoLabel(admin, orderId);

  return { ok: true, paidAt: payment.paidAt, method: payment.method, warnings };
}
