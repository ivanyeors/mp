import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { attachHoldPaymentIntent, releaseHold } from "@/lib/authorization-hold";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { createMpConfigFromCustomization } from "@/lib/ecommerce/mp-config-sync";
import { updateCustomerStats } from "@/lib/ecommerce/customers";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { stripeEventTime, stripeTime } from "@/lib/stripe/money-time";
import { applyRmaTransition } from "@/lib/rma/transition";
import {
  createHeldCommissionsForOrder,
  voidCommissionsForOrder,
  type CommissionItemInput,
} from "@/lib/commissions/ledger";
import { applyMilestoneProgress } from "@/lib/milestones/ledger";
import { reconcileOrderTotal, sessionTotals } from "@/lib/stripe/reconcile";
import { sendOrderConfirmedEmails, sendRefundEmail } from "@/lib/email";
import {
  READJUSTMENT_PURPOSE,
  expireReadjustmentBooking,
  finalizeReadjustmentBooking,
} from "@/lib/readjustment/checkout";
import { sendReferralEarnedEmail } from "@/lib/email/partner";
import { clawbackPointsForRefund } from "@/lib/points/earn";
import { releasePoints } from "@/lib/points/spend";
import { sendTelegram } from "@/lib/telegram/notify";
import { scheduleAutoLabel, scheduleLabelCancel } from "@/lib/shipping/schedule-labels";
import { STAFF_ORDER_PURPOSE } from "@/lib/staff-orders/shared";
import { recordPaidOrderVisit } from "@/lib/analytics/journey/identity";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

class CriticalWebhookError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "CriticalWebhookError";
  }
}

async function releaseOrderPoints(admin: SupabaseClient, orderId: string) {
  const released = await releasePoints(admin, orderId);
  if (!released.ok) {
    console.error(`[stripe/webhook] Points for order ${orderId} were not released; the daily sweep will: ${released.error}`);
    return;
  }
  if (released.released) {
    try {
      await addOrderTimelineEvent(orderId, "points_released", "Points reserved at checkout returned", {});
    } catch (err) {
      console.error(`[stripe/webhook] Timeline event failed for ${orderId}:`, err);
    }
  }
}

async function clawbackRefundPoints(admin: SupabaseClient, orderId: string, refunds: Stripe.Refund[]) {
  for (const r of refunds) {
    const clawback = await clawbackPointsForRefund(admin, { orderId, refundId: r.id, amount: r.amount / 100 });
    if ("error" in clawback) console.error(`[stripe/webhook] Points not taken back for refund ${r.id}: ${clawback.error}`);
  }
}

async function orderIdForIntent(admin: SupabaseClient, paymentIntentId: string): Promise<string | null> {
  const { data: byReference, error } = await admin
    .from("orders")
    .select("id")
    .eq("payment_reference", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error(`Order lookup for ${paymentIntentId} failed: ${error.message}`);
  if (byReference) return byReference.id as string;

  const { data: charge, error: chargeErr } = await admin
    .from("order_payments")
    .select("order_id")
    .eq("stripe_object_id", paymentIntentId)
    .eq("type", "charge")
    .maybeSingle();
  if (chargeErr) throw new Error(`Charge lookup for ${paymentIntentId} failed: ${chargeErr.message}`);
  return (charge?.order_id as string | undefined) ?? null;
}

async function recordWebhookFailure(
  admin: SupabaseClient,
  event: Stripe.Event,
  error: string
): Promise<boolean> {
  try {
    const { error: writeError } = await admin.from("stripe_webhook_failures").upsert(
      {
        event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
        error,
      },
      { onConflict: "event_id" }
    );
    if (!writeError) return true;
    console.error("[stripe/webhook] Failed to write dead-letter row:", writeError.message);
  } catch (err) {
    console.error("[stripe/webhook] Failed to write dead-letter row:", err);
  }
  return false;
}

const CONFIRMABLE_STATUSES = new Set(["pending", "payment_failed"]);

async function pointsWereReleased(admin: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("points_ledger")
    .select("id")
    .eq("order_id", orderId)
    .eq("kind", "spend_release")
    .limit(1);
  if (error) throw new Error(`Points ledger read failed for ${orderId}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function flagOrder(
  admin: SupabaseClient,
  orderId: string,
  eventType: string,
  detail: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await admin.from("orders").update({ needs_attention: true }).eq("id", orderId);
  if (error) throw new Error(`Could not flag order ${orderId}: ${error.message}`);
  console.error(`[stripe/webhook] ${detail}`);
  await addOrderTimelineEvent(orderId, eventType, detail, metadata);
}

async function settleSucceededRefunds(
  admin: SupabaseClient,
  paymentIntentId: string,
  chargeId: string | null,
  refunds: Stripe.Refund[],
) {
  if (refunds.length === 0) return;
  const refundedOrderId = await orderIdForIntent(admin, paymentIntentId);
  if (!refundedOrderId) return;

  const { data: order, error: refundedError } = await admin
    .from("orders")
    .select(
      "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, points_spent, total, status, coupon_id, customer_id, shipping_address, partner_id, order_items(*)"
    )
    .eq("id", refundedOrderId)
    .maybeSingle();

  if (refundedError) throw new Error(`Refund lookup for ${paymentIntentId} failed: ${refundedError.message}`);
  if (!order) return;

  const wasFullyRefunded = order.status === "refunded";

  let newlyRecorded = 0;
  const recordedNow: Stripe.Refund[] = [];
  for (const r of refunds) {
    const { recorded } = await recordLedgerEntry(admin, order.id, {
      type: "refund",
      amount: -(r.amount / 100),
      currency: (r.currency ?? order.currency ?? "SGD").toUpperCase(),
      stripeObjectId: r.id,
      metadata: {
        charge_id: chargeId,
        payment_intent: paymentIntentId,
        reason: r.reason ?? null,
      },
      occurredAt: stripeTime(r.created),
    });
    if (recorded) {
      newlyRecorded++;
      recordedNow.push(r);
      const rmaId = r.metadata?.rma_request_id;
      if (rmaId) {
        try {
          await applyRmaTransition(admin, { rmaId, to: "refunded", actorType: "system" });
        } catch (err) {
          console.error(`[stripe/webhook] RMA ${rmaId} settle failed:`, err);
        }
      }
    }
  }

  if (newlyRecorded === 0) return;

  const state = await rollupOrderMoney(admin, order.id);
  const nowFullyRefunded = state.status === "refunded";

  await clawbackRefundPoints(admin, order.id, recordedNow);

  await addOrderTimelineEvent(
    order.id,
    nowFullyRefunded ? "refunded" : "partially_refunded",
    nowFullyRefunded
      ? "Order fully refunded via Stripe"
      : `Partial refund recorded via Stripe (${state.amountRefunded} of ${state.amountCaptured})`,
    {
      charge_id: chargeId,
      payment_intent: paymentIntentId,
      amount_refunded: state.amountRefunded,
    }
  );

  if (nowFullyRefunded && !wasFullyRefunded) {
    scheduleLabelCancel(admin, order.id);
    if (order.partner_id) {
      try {
        await voidCommissionsForOrder(admin, order.id);
      } catch (err) {
        console.error(`[stripe/webhook] Commission void failed for ${order.id}:`, err);
      }
    }
    if (order.coupon_id) {
      const { decrementCouponUsage } = await import("@/lib/ecommerce/discounts");
      try {
        await decrementCouponUsage(order.coupon_id);
      } catch (err) {
        console.error(`[stripe/webhook] Coupon usage decrement failed for ${order.id}:`, err);
      }
    }
    if (order.customer_id) {
      try {
        await updateCustomerStats(order.customer_id);
      } catch (err) {
        console.error(`[stripe/webhook] Customer stats update failed:`, err);
      }
    }
  }

  try {
    await sendRefundEmail(order.id, order, state.amountRefunded, admin);
  } catch (err) {
    console.error(`[stripe/webhook] Refund email failed for ${order.id}:`, err);
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = supabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const resultId = session.metadata?.result_id;
        const orderId = session.metadata?.order_id;

        if (resultId && !orderId) {
          const paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;

          if (session.metadata?.purpose === "result_topup") {
            if (paymentIntent && session.payment_status === "paid") {
              const { data: stamped, error: stampError } = await admin
                .from("mp_config_responses")
                .update({
                  topup_payment_intent_id: paymentIntent,
                  topup_paid_at: stripeEventTime(event),
                })
                .eq("id", resultId)
                .in("status", ["assigned", "accepted"])
                .select("id");
              if (stampError) throw new Error(`Top-up stamp failed for Result ${resultId}: ${stampError.message}`);
              if (!stamped?.length) {
                const detail = `Balance payment ${paymentIntent} for Result ${resultId} arrived after the Result left assigned/accepted. Refund or settle it by hand.`;
                console.error(`[stripe/webhook] ${detail}`);
                await recordWebhookFailure(admin, event, detail);
              }
            }
            break;
          }

          const attached = await attachHoldPaymentIntent(admin, session);
          if (!attached.ok && attached.mismatch) {
            console.error(`[stripe/webhook] ${attached.mismatch}`);
            await recordWebhookFailure(admin, event, attached.mismatch);
            const refusedIntent =
              typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
            if (refusedIntent) {
              await releaseHold(refusedIntent).catch((err) =>
                console.error(`[stripe/webhook] release of refused hold ${refusedIntent} failed`, err),
              );
            }
          }
          break;
        }

        if (!orderId) {
          if (session.payment_status !== "paid") break;
          const intent =
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? "none";
          const link =
            typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id ?? "none";
          const detail =
            `Stripe took ${(session.currency ?? "").toUpperCase()} ${((session.amount_total ?? 0) / 100).toFixed(2)} ` +
            `in Checkout Session ${session.id} (payment ${intent}, payment link ${link}) ` +
            `with no Order or Result to attach it to. No Order was made, no stock was deducted and no receipt was sent. ` +
            `Refund it in Stripe or make the Order by hand.`;
          console.error(`[stripe/webhook] ${detail}`);
          const recorded = await recordWebhookFailure(admin, event, detail);
          const told = (await sendTelegram(detail).catch(() => "failed")) === "sent";
          if (!recorded && !told) throw new Error(`${detail} It could not be recorded or sent to Staff.`);
          break;
        }

        if (session.payment_status === "unpaid") {
          const pendingCartToken = session.metadata?.cart_token;
          if (pendingCartToken) {
            await admin.from("carts").delete().eq("token", pendingCartToken);
          }

          await admin
            .from("orders")
            .update({ needs_attention: true })
            .eq("id", orderId);

          await addOrderTimelineEvent(
            orderId,
            "payment_pending",
            "Delayed payment method authorised — awaiting settlement",
            { stripe_session_id: session.id }
          );
          break;
        }

        const { data: order, error: orderError } = await admin
          .from("orders")
          .select(
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, points_spent, total, status, paid_at, coupon_id, customer_id, shipping_address, tracking_number, tracking_url, partner_id, delivered_at, order_items(*)"
          )
          .eq("id", orderId)
          .maybeSingle();

        if (orderError) throw new Error(`Order ${orderId} could not be read: ${orderError.message}`);
        if (!order) break;

        const paymentIntent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const totals = sessionTotals(session);
        const recon = reconcileOrderTotal(order, totals);
        if (!recon.ok && !order.paid_at) {
          const detail =
            `Order ${orderId} total mismatch: Stripe charged ${recon.sessionTotal}, ` +
            `expected ${recon.expectedTotal} (delta ${recon.delta}).`;
          console.error(`[stripe/webhook] ${detail}`);
          await recordWebhookFailure(admin, event, detail);
          await addOrderTimelineEvent(orderId, "total_mismatch", detail, {
            stripe_session_id: session.id,
            session_total: recon.sessionTotal,
            expected_total: recon.expectedTotal,
          });
          break;
        }

        if (!order.paid_at && !CONFIRMABLE_STATUSES.has(String(order.status))) {
          if (paymentIntent) {
            await recordLedgerEntry(admin, orderId, {
              type: "charge",
              amount: recon.writeBack.total,
              currency: order.currency ?? "SGD",
              stripeObjectId: paymentIntent,
              metadata: { stripe_session_id: session.id, paid_while: order.status },
              occurredAt: stripeEventTime(event),
            });
            await rollupOrderMoney(admin, orderId);
          }
          const detail = `Order ${orderId} was paid while ${order.status}. Not fulfilled: refund or reinstate it.`;
          await flagOrder(admin, orderId, "paid_while_closed", detail, { stripe_session_id: session.id });
          await recordWebhookFailure(admin, event, detail);
          break;
        }

        if (!order.paid_at && Number(order.points_spent ?? 0) > 0 && (await pointsWereReleased(admin, orderId))) {
          await flagOrder(
            admin,
            orderId,
            "points_returned_before_payment",
            `The ${order.points_spent} points used on this order were returned before it was paid. Recover them or the discount.`,
            { points_spent: order.points_spent },
          );
        }

        let justConfirmed = false;
        if (!order.paid_at) {
          const { data: confirmed, error: confirmError } = await admin
            .from("orders")
            .update({
              status: "confirmed",
              paid_at: stripeEventTime(event),
              payment_method: "stripe",
              payment_reference: paymentIntent,
              tax_amount: recon.writeBack.tax_amount,
              total: recon.writeBack.total,
            })
            .eq("id", orderId)
            .is("paid_at", null)
            .select("id")
            .maybeSingle();

          if (confirmError) {
            throw new CriticalWebhookError(
              `Failed to confirm order ${orderId}: ${confirmError.message}`
            );
          }
          justConfirmed = Boolean(confirmed);
        }

        if (paymentIntent) {
          await recordLedgerEntry(admin, orderId, {
            type: "charge",
            amount: recon.writeBack.total,
            currency: order.currency ?? "SGD",
            stripeObjectId: paymentIntent,
            metadata: { stripe_session_id: session.id },
            occurredAt: stripeEventTime(event),
          });
          await rollupOrderMoney(admin, orderId);
        }

        if (order.partner_id) {
          let qualifies = false;
          try {
            qualifies = await createHeldCommissionsForOrder(admin, {
              orderId: order.id,
              partnerId: order.partner_id as string,
              deliveredAt: (order.delivered_at as string | null) ?? null,
              items: (order.order_items ?? []) as CommissionItemInput[],
            });
          } catch (err) {
            console.error(`[stripe/webhook] Commission creation failed for ${orderId}:`, err);
          }
          try {
            await applyMilestoneProgress(admin, order.partner_id as string);
          } catch (err) {
            console.error(`[stripe/webhook] Milestone progress failed for ${orderId}:`, err);
          }
          if (qualifies) {
            try {
              await sendReferralEarnedEmail(admin, {
                partnerId: order.partner_id as string,
                orderId: order.id,
                currency: order.currency ?? "SGD",
              });
            } catch (err) {
              console.error(`[stripe/webhook] Referral-earned email failed for ${orderId}:`, err);
            }
          }
        }

        const items = (order.order_items ?? []) as Array<{
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;

        const { data: claimed, error: claimError } = await admin
          .from("orders")
          .update({ inventory_deducted_at: new Date().toISOString() })
          .eq("id", orderId)
          .is("inventory_deducted_at", null)
          .select("id")
          .maybeSingle();
        if (claimError) {
          throw new CriticalWebhookError(
            `Failed to claim inventory deduction for ${orderId}: ${claimError.message}`,
            claimError
          );
        }

        if (claimed) {
          try {
            await deductInventoryForOrder(orderId, items);
          } catch (err) {
            await admin.from("orders").update({ inventory_deducted_at: null }).eq("id", orderId);
            const message = err instanceof Error ? err.message : String(err);
            await admin.from("orders").update({ needs_attention: true }).eq("id", orderId);
            await addOrderTimelineEvent(
              orderId,
              "oversold",
              `Paid order could not be fulfilled from stock: ${message}`,
              { reason: message }
            );
            console.error(
              `[stripe/webhook] OVERSOLD paid order ${orderId}: ${message}`
            );
            throw new CriticalWebhookError(
              `Inventory deduction failed for order ${orderId}: ${message}`,
              err
            );
          }
        }

        const orderItemsForSync = (order.order_items ?? []) as Array<{
          id: string;
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;
        const shippingAddr = order.shipping_address as { recipient?: string } | null;
        try {
          await createMpConfigFromCustomization(orderId, orderItemsForSync, shippingAddr);
        } catch (err) {
          console.error(`[stripe/webhook] MP config creation failed for order ${orderId}:`, err);
        }

        if (justConfirmed && order.coupon_id) {
          const { incrementCouponUsage } = await import("@/lib/ecommerce/discounts");
          let counted = true;
          try {
            counted = await incrementCouponUsage(order.coupon_id);
          } catch (err) {
            console.error(`[stripe/webhook] Coupon usage increment failed:`, err);
          }
          if (!counted) {
            await flagOrder(
              admin,
              orderId,
              "coupon_limit_reached",
              "This order used a coupon that had already reached its usage limit.",
              { coupon_id: order.coupon_id },
            );
          }
        }

        if (order.customer_id) {
          try {
            await updateCustomerStats(order.customer_id);
          } catch (err) {
            console.error(`[stripe/webhook] Customer stats update failed:`, err);
          }
        }

        if (justConfirmed) {
          await addOrderTimelineEvent(
            orderId,
            "payment_confirmed",
            "Payment confirmed via Stripe",
            { stripe_session_id: session.id, payment_intent: paymentIntent }
          );
          if (!session.metadata?.purpose) {
            await recordPaidOrderVisit(admin, {
              orderId,
              customerId: order.customer_id as string | null,
              email: order.email as string | null,
            });
          }
        }

        const cartToken = session.metadata?.cart_token;
        if (cartToken) {
          await admin.from("carts").delete().eq("token", cartToken);
        }

        try {
          await sendOrderConfirmedEmails(orderId, order, admin);
        } catch (err) {
          console.error(`[stripe/webhook] Order emails failed for ${orderId}:`, err);
        }

        scheduleAutoLabel(admin, orderId);

        const readjustmentBookingId = session.metadata?.readjustment_booking_id;
        if (session.metadata?.purpose === READJUSTMENT_PURPOSE && readjustmentBookingId) {
          try {
            await finalizeReadjustmentBooking(
              admin,
              readjustmentBookingId,
              session.metadata?.language_preference,
            );
          } catch (err) {
            throw new CriticalWebhookError(
              `Paid re-adjustment ${readjustmentBookingId} could not be booked: ${
                err instanceof Error ? err.message : String(err)
              }`,
              err,
            );
          }
        }

        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!order) break;

        if (order.status === "pending") {
          await admin
            .from("orders")
            .update({ status: "payment_failed" })
            .eq("id", order.id);

          await addOrderTimelineEvent(
            order.id,
            "payment_failed",
            "Delayed payment method failed to settle",
            { stripe_session_id: session.id }
          );
        }

        await releaseOrderPoints(admin, order.id);

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (
          session.metadata?.purpose === READJUSTMENT_PURPOSE &&
          session.metadata?.readjustment_booking_id
        ) {
          await expireReadjustmentBooking(admin, session.metadata.readjustment_booking_id);
        }

        if (session.metadata?.purpose === STAFF_ORDER_PURPOSE) break;

        const { data: order, error: expiredError } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (expiredError) throw new Error(`Expired session ${session.id} lookup failed: ${expiredError.message}`);
        if (!order) break;

        if (order.status === "pending") {
          await admin
            .from("orders")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          await addOrderTimelineEvent(
            order.id,
            "session_expired",
            "Stripe checkout session expired — order cancelled",
            { stripe_session_id: session.id }
          );
        }

        await releaseOrderPoints(admin, order.id);

        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        if (!paymentIntentId) break;

        // ponytail: relies on charge.refunds.data (Stripe returns the latest ~10). Ceiling: an
        // order with >10 distinct refunds could miss older ids on a late redelivery. Upgrade path:
        // handle refund.created directly, as refund.updated is.
        const succeeded = (charge.refunds?.data ?? []).filter((r) => r.status === "succeeded");
        await settleSucceededRefunds(admin, paymentIntentId, charge.id, succeeded);
        break;
      }

      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        if (refund.status !== "succeeded") break;
        const paymentIntentId =
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id ?? null;
        if (!paymentIntentId) break;
        const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
        await settleSucceededRefunds(admin, paymentIntentId, chargeId, [refund]);
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.order_id ?? null;

        const { data: order } = orderId
          ? await admin
              .from("orders")
              .select("id, status")
              .eq("id", orderId)
              .maybeSingle()
          : await admin
              .from("orders")
              .select("id, status")
              .eq("payment_reference", intent.id)
              .maybeSingle();

        if (!order) break;

        if (order.status !== "pending") break;

        const failureMessage =
          intent.last_payment_error?.message ?? "Payment failed";

        await addOrderTimelineEvent(
          order.id,
          "payment_failed",
          `Payment failed: ${failureMessage}`,
          {
            payment_intent: intent.id,
            decline_code: intent.last_payment_error?.decline_code ?? null,
          }
        );

        break;
      }

      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.cancellation_reason !== "automatic") break;

        const { data: lapsed, error: lapsedError } = await admin
          .from("mp_config_responses")
          .update({ payment_intent_id: null })
          .eq("payment_intent_id", intent.id)
          .in("status", ["held", "assigned"])
          .select("id");
        if (lapsedError) throw new Error(`Expired hold ${intent.id} not recorded: ${lapsedError.message}`);
        if (!lapsed?.length) break;

        const ids = lapsed.map((r) => r.id).join(", ");
        console.error(`[stripe/webhook] Authorization hold ${intent.id} expired for Result ${ids}`);
        await sendTelegram(
          `Authorization hold expired (7 days) for Result ${ids}. The card can no longer be charged; Accept now asks the customer to pay the full total.`,
        ).catch(() => null);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;

        if (!paymentIntentId) break;

        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("payment_reference", paymentIntentId)
          .maybeSingle();

        if (!order) break;

        await admin
          .from("orders")
          .update({ status: "disputed" })
          .eq("id", order.id);

        await addOrderTimelineEvent(
          order.id,
          "dispute_created",
          "Chargeback/dispute opened via Stripe",
          {
            dispute_id: dispute.id,
            charge_id: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null,
            reason: dispute.reason,
            amount: dispute.amount,
          }
        );

        console.error(
          `[stripe/webhook] DISPUTE opened for order ${order.id} (dispute ${dispute.id}, reason: ${dispute.reason})`
        );
        await sendTelegram(
          `Chargeback opened on order ${order.id}: ${dispute.currency?.toUpperCase() ?? ""} ${(dispute.amount / 100).toFixed(2)}, reason "${dispute.reason}". Respond in the Stripe Dashboard before the evidence deadline.`,
        ).catch(() => null);

        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;

        if (!paymentIntentId) break;

        const { data: order } = await admin
          .from("orders")
          .select("id, currency, status")
          .eq("payment_reference", paymentIntentId)
          .maybeSingle();

        if (!order) break;

        if (dispute.status !== "won" && dispute.status !== "lost") break;

        const feeMinor = (dispute.balance_transactions ?? []).reduce(
          (sum, bt) => sum + (bt.fee ?? 0),
          0
        );

        if (dispute.status === "won") {
          await admin.from("orders").update({ status: "confirmed" }).eq("id", order.id);
        } else {
          await recordLedgerEntry(admin, order.id, {
            type: "dispute_loss",
            amount: -(dispute.amount / 100),
            currency: order.currency ?? "SGD",
            stripeObjectId: dispute.id,
            metadata: { reason: dispute.reason },
            occurredAt: stripeEventTime(event),
          });
        }

        if (feeMinor) {
          await recordLedgerEntry(admin, order.id, {
            type: "fee",
            amount: -(feeMinor / 100),
            currency: order.currency ?? "SGD",
            stripeObjectId: `${dispute.id}:fee`,
            metadata: { kind: "dispute_fee" },
            occurredAt: stripeEventTime(event),
          });
        }

        await rollupOrderMoney(admin, order.id);

        await addOrderTimelineEvent(
          order.id,
          "dispute_closed",
          `Dispute ${dispute.status} (amount ${dispute.amount / 100}` +
            (feeMinor ? `, fee ${feeMinor / 100}` : "") +
            ")",
          { dispute_id: dispute.id, status: dispute.status }
        );

        break;
      }

      case "refund.failed": {
        const refund = event.data.object as Stripe.Refund;
        const paymentIntentId =
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id ?? null;

        const detail = `Refund ${refund.id} failed (${refund.failure_reason ?? "unknown reason"})`;

        const failedOrderId = paymentIntentId ? await orderIdForIntent(admin, paymentIntentId) : null;
        const { data: order } = failedOrderId
          ? await admin.from("orders").select("id, currency").eq("id", failedOrderId).maybeSingle()
          : { data: null };

        if (order) {
          await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);

          const { count } = await admin
            .from("order_payments")
            .select("id", { count: "exact", head: true })
            .eq("stripe_object_id", refund.id);
          if ((count ?? 0) > 0) {
            await recordLedgerEntry(admin, order.id, {
              type: "adjustment",
              amount: refund.amount / 100,
              currency: order.currency ?? "SGD",
              stripeObjectId: `${refund.id}:failed`,
              metadata: { kind: "refund_reversal" },
              occurredAt: stripeEventTime(event),
            });
            await rollupOrderMoney(admin, order.id);
          }

          await addOrderTimelineEvent(order.id, "refund_failed", detail, {
            refund_id: refund.id,
            failure_reason: refund.failure_reason ?? null,
          });
        }

        await recordWebhookFailure(admin, event, detail);
        console.error(`[stripe/webhook] ${detail}`);

        break;
      }

      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error(`[stripe/webhook] Error handling ${event.type}:`, message);

    await recordWebhookFailure(admin, event, message);
    return NextResponse.json(
      { ok: false, error: err instanceof CriticalWebhookError ? message : "Webhook handler error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, type: event.type });
}
