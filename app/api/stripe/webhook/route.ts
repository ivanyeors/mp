import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { attachHoldPaymentIntent, releaseHold } from "@/lib/authorization-hold";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { createMpConfigFromCustomization } from "@/lib/ecommerce/mp-config-sync";
import { updateCustomerStats } from "@/lib/ecommerce/customers";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { applyRmaTransition } from "@/lib/rma/transition";
import { createHeldCommissionsForOrder, voidCommissionsForOrder } from "@/lib/commissions/ledger";
import { applyMilestoneProgress } from "@/lib/milestones/ledger";
import { round2 } from "@/lib/commissions";
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
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Thrown by critical webhook steps (order confirmation, inventory deduction).
 * Critical failures are dead-lettered and answered with HTTP 500 so Stripe
 * retries. Non-critical failures are logged and answered with 200.
 */
class CriticalWebhookError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "CriticalWebhookError";
  }
}

/**
 * Gives back the points an unpaid Order reserved (ADR 0030 (j)). Not critical:
 * the Order is already cancelled or failed by now, and the daily sweep
 * releases any reservation on such an Order that this missed.
 */
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

/**
 * Takes back the points each newly recorded refund's cash earned (ADR 0030
 * (m)); once per refund id in SQL. Only refunds this delivery recorded: an
 * older one was settled when it arrived, and if it came before the points
 * were written it is already in their base. Never fails the webhook: the
 * money has already moved, so a failure is logged.
 */
async function clawbackRefundPoints(admin: SupabaseClient, orderId: string, refunds: Stripe.Refund[]) {
  for (const r of refunds) {
    const clawback = await clawbackPointsForRefund(admin, { orderId, refundId: r.id, amount: r.amount / 100 });
    if ("error" in clawback) console.error(`[stripe/webhook] Points not taken back for refund ${r.id}: ${clawback.error}`);
  }
}

/** Idempotently record a failed event to the dead-letter table (keyed by event id). */
async function recordWebhookFailure(
  admin: SupabaseClient,
  event: Stripe.Event,
  error: string
) {
  try {
    await admin.from("stripe_webhook_failures").upsert(
      {
        event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
        error,
      },
      { onConflict: "event_id" }
    );
  } catch (err) {
    console.error("[stripe/webhook] Failed to write dead-letter row:", err);
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
      // Delayed-notification methods (PayNow, EPS, Bancontact — all enabled on
      // the live account) fire `completed` when the customer AUTHORISES, with
      // the money not yet settled, then `async_payment_succeeded` when it does.
      // Both fulfil identically, so they share this block; the payment_status
      // gate below is what keeps the authorise-only pass from fulfilling early.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const resultId = session.metadata?.result_id;
        const orderId = session.metadata?.order_id;

        // Result authorization hold (manual-capture PI) — attach PI id, do not create an order.
        if (resultId && !orderId) {
          const paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;

          // A top-up rides the same shape (result_id, no order_id) but is an
          // immediate-capture second charge on an ALREADY-assigned Result. The old
          // `.eq("status","held")` guard made it a silent no-op, so a customer who
          // paid and never returned left money charged with nothing recording it.
          // Stamp it instead; accept settles with this intent rather than charging
          // twice, and the Results queue can surface it as stuck meanwhile.
          if (session.metadata?.purpose === "result_topup") {
            if (paymentIntent && session.payment_status === "paid") {
              await admin
                .from("mp_config_responses")
                .update({
                  topup_payment_intent_id: paymentIntent,
                  topup_paid_at: new Date().toISOString(),
                })
                .eq("id", resultId)
                // `accepted` too: accept holds that status while it settles, and a
                // stamp dropped there is lost if that attempt fails and hands back.
                .in("status", ["assigned", "accepted"]);
            }
            break;
          }

          // Amount, currency and state checks live in the shared writer, which the
          // status page's return-from-Stripe sync also uses.
          const attached = await attachHoldPaymentIntent(admin, session);
          if (!attached.ok && attached.mismatch) {
            console.error(`[stripe/webhook] ${attached.mismatch}`);
            await recordWebhookFailure(admin, event, attached.mismatch);
            // The refused card is attached to nothing, so no cron would ever
            // release it: free the customer's funds now instead of in 7 days.
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

        if (!orderId) break;

        // Fulfil only once Stripe says the money is claimed. `unpaid` means a
        // delayed-notification method is mid-flight: fulfilling now would deduct
        // inventory, hold commissions and email a receipt for cash that may
        // never arrive, and stamping paid_at would make the later
        // async_payment_failed a no-op.
        //
        // Defence in depth, not a live path today: this account is SGD-only, and
        // its presentable methods (card, Apple Pay, Link, PayNow) all confirm in
        // real time — PayNow is Stripe's "real-time payments" family, NOT delayed
        // notification. The gate matters the day a delayed method or a second
        // currency is turned on, and costs nothing before then.
        //
        // Test `unpaid` rather than `!== "paid"`: a 100%-discount order settles as
        // `no_payment_required` and must still fulfil.
        //
        // The authorization-hold branch above deliberately does NOT get this
        // gate — a manual-capture PI reads `unpaid` until capture, by design.
        if (session.payment_status === "unpaid") {
          // The session is `complete`, so the cart is spent either way. Leaving it
          // intact lets the shopper re-checkout (the confirmation page shows
          // success unconditionally, and /api/shop/checkout has no pending-order
          // guard) and pay a second time for the same goods.
          const pendingCartToken = session.metadata?.cart_token;
          if (pendingCartToken) {
            await admin.from("carts").delete().eq("token", pendingCartToken);
          }

          // Flag it: an order sitting `pending` with money in flight is otherwise
          // indistinguishable from an abandoned cart, and nothing sweeps for it.
          // If async_payment_succeeded never arrives, this is the only signal.
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

        // Fetch order with items
        const { data: order } = await admin
          .from("orders")
          .select(
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, points_spent, total, status, paid_at, coupon_id, customer_id, shipping_address, tracking_number, tracking_url, partner_id, delivered_at, order_items(*)"
          )
          .eq("id", orderId)
          .single();

        if (!order) break;

        const paymentIntent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        // Reconcile what Stripe charged against what we computed. The pre-tax
        // amount (subtotal − discount + shipping) is ours to get right; tax and
        // grand total are Stripe's authority and get written back. A mismatch
        // means a discount/price/shipping leak — flag it, never silently confirm.
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
          // Leave the order unconfirmed for manual review and ack the event so
          // Stripe doesn't retry a deterministic mismatch forever.
          break;
        }

        // Step 1 (CRITICAL): Update order to confirmed (idempotent — skip if
        // already paid). Tax/total are written back from the completed session.
        if (!order.paid_at) {
          const { error: confirmError } = await admin
            .from("orders")
            .update({
              status: "confirmed",
              paid_at: new Date().toISOString(),
              payment_method: "stripe",
              payment_reference: paymentIntent,
              tax_amount: recon.writeBack.tax_amount,
              total: recon.writeBack.total,
            })
            .eq("id", orderId);

          if (confirmError) {
            throw new CriticalWebhookError(
              `Failed to confirm order ${orderId}: ${confirmError.message}`
            );
          }
        }

        // Step 1b: Record the captured charge in the money ledger (idempotent on
        // the PaymentIntent id) and roll up amount_captured. The ledger — not the
        // order status — is the source of truth for the order's net money.
        if (paymentIntent) {
          await recordLedgerEntry(admin, orderId, {
            type: "charge",
            amount: recon.writeBack.total,
            currency: order.currency ?? "SGD",
            stripeObjectId: paymentIntent,
            metadata: { stripe_session_id: session.id },
          });
          await rollupOrderMoney(admin, orderId);
        }

        // Step 1c: Held commissions for an attributed order (#77). Only pillow/bolster
        // lines earn; the BASE is separated from add-ons (add-on price is folded into
        // unit_price via the customization snapshot), and shipping/tax are excluded.
        // Idempotent on order_item_id. delivered_at is null at paid-time for shop
        // orders, so release stays undated until the order is delivered (never paid_at).
        if (order.partner_id) {
          try {
            const commissionLines = (
              (order.order_items ?? []) as Array<{
                id: string;
                unit_price: number | string;
                quantity: number;
                customization_snapshot?: {
                  product_type?: string;
                  total_addon_price?: number;
                } | null;
              }>
            ).flatMap((it) => {
              const pt = it.customization_snapshot?.product_type;
              if (pt !== "pillow" && pt !== "bolster") return [];
              const addonPerUnit = Number(it.customization_snapshot?.total_addon_price ?? 0);
              const basePerUnit = Math.max(0, Number(it.unit_price) - addonPerUnit);
              return [
                {
                  orderItemId: it.id,
                  productType: pt as "pillow" | "bolster",
                  baseAmount: round2(basePerUnit * it.quantity),
                  quantity: it.quantity,
                },
              ];
            });
            await createHeldCommissionsForOrder(admin, {
              orderId: order.id,
              partnerId: order.partner_id as string,
              deliveredAt: (order.delivered_at as string | null) ?? null,
              lines: commissionLines,
            });
          } catch (err) {
            console.error(`[stripe/webhook] Commission creation failed for ${orderId}:`, err);
          }
          // Milestone rung-crossing (#79): best-effort, never break the webhook.
          try {
            await applyMilestoneProgress(admin, order.partner_id as string);
          } catch (err) {
            console.error(`[stripe/webhook] Milestone progress failed for ${orderId}:`, err);
          }
          // Referral-earned email (#84): once per attributed order (entity_id = order
          // id). delivered_at is null for a fresh shop order, so the copy states the
          // release is 30 days after delivery. Best-effort — never break the webhook.
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

        const items = (order.order_items ?? []) as Array<{
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;

        // Step 2 (CRITICAL): Deduct inventory once. Claiming the Order first means
        // two concurrent deliveries cannot both deduct.
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
            // Release the claim so Stripe's retry deducts; the ledger insert is all-or-nothing.
            await admin.from("orders").update({ inventory_deducted_at: null }).eq("id", orderId);
            const message = err instanceof Error ? err.message : String(err);
            // Oversold: a PAID order can't be fulfilled from stock. Flag it loudly
            // for a human to refund/reconcile (the dead-letter + 500 retry happens
            // via CriticalWebhookError below) instead of silently overselling.
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

        // Step 3: Auto-create mp-config responses (already idempotent internally)
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

        // Step 4: Increment coupon usage (idempotent — only if order was just confirmed)
        if (!order.paid_at && order.coupon_id) {
          const { incrementCouponUsage } = await import("@/lib/ecommerce/discounts");
          try {
            await incrementCouponUsage(order.coupon_id);
          } catch (err) {
            console.error(`[stripe/webhook] Coupon usage increment failed:`, err);
          }
        }

        // Step 5: Update customer stats
        if (order.customer_id) {
          try {
            await updateCustomerStats(order.customer_id);
          } catch (err) {
            console.error(`[stripe/webhook] Customer stats update failed:`, err);
          }
        }

        // Step 6: Add timeline event (idempotent — skip if already paid)
        if (!order.paid_at) {
          await addOrderTimelineEvent(
            orderId,
            "payment_confirmed",
            "Payment confirmed via Stripe",
            { stripe_session_id: session.id, payment_intent: paymentIntent }
          );
        }

        // Step 7: Clear cart if cart token in metadata
        const cartToken = session.metadata?.cart_token;
        if (cartToken) {
          await admin.from("carts").delete().eq("token", cartToken);
        }

        // Step 8: Send order-confirmation + payment-receipt emails (idempotent,
        // non-critical — failures are logged and never break the webhook).
        if (!order.paid_at) {
          try {
            await sendOrderConfirmedEmails(orderId, order, admin);
          } catch (err) {
            console.error(`[stripe/webhook] Order emails failed for ${orderId}:`, err);
          }
        }

        // Step 9: a paid Re-adjustment (ADR 0024) — the money is in, so put the
        // visit on the calendar. Idempotent on the booking's calendar event, so a
        // replay writes nothing. Critical: money with no booked visit must retry.
        const readjustmentBookingId = session.metadata?.readjustment_booking_id;
        if (session.metadata?.purpose === READJUSTMENT_PURPOSE && readjustmentBookingId) {
          try {
            await finalizeReadjustmentBooking(admin, readjustmentBookingId);
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

      // The delayed payment never settled. Without this the order sits `pending`
      // forever: `expired` never fires for a session that completed, so nothing
      // else would ever close it out.
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Keyed on stripe_session_id like the `expired` case below, not on
        // metadata — the column is stored and indexed, and survives metadata edits.
        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!order) break;

        // Never clobber an order that got paid another way.
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

        // Points reserved for it come back (ADR 0030 (j)). Also on a replay,
        // in case the first delivery failed here: release_points writes at
        // most once, and never for a paid Order.
        await releaseOrderPoints(admin, order.id);

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        // A Re-adjustment Checkout that lapsed unpaid releases its slot hold
        // (ADR 0024); the Order below is cancelled exactly like a shop order's.
        if (
          session.metadata?.purpose === READJUSTMENT_PURPOSE &&
          session.metadata?.readjustment_booking_id
        ) {
          await expireReadjustmentBooking(admin, session.metadata.readjustment_booking_id);
        }

        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .single();

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

        // The Checkout lapsed unpaid: points reserved for it come back
        // (ADR 0030 (j)). A replay writes nothing, and a paid Order never
        // gives them back.
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

        const { data: order } = await admin
          .from("orders")
          .select(
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, points_spent, total, status, coupon_id, customer_id, shipping_address, partner_id, order_items(*)"
          )
          .eq("payment_reference", paymentIntentId)
          .single();

        if (!order) break;

        const wasFullyRefunded = order.status === "refunded";

        // Record each SUCCEEDED refund as a signed ledger row, idempotent on the
        // refund id. A re-delivered event records nothing new and is a no-op.
        // ponytail: relies on charge.refunds.data (Stripe returns the latest ~10).
        // Ceiling: an order with >10 distinct refunds could miss older ids on a
        // late redelivery. Upgrade path: handle refund.* events directly.
        const refunds = (charge.refunds?.data ?? []).filter((r) => r.status === "succeeded");
        let newlyRecorded = 0;
        const recordedNow: Stripe.Refund[] = [];
        for (const r of refunds) {
          const { recorded } = await recordLedgerEntry(admin, order.id, {
            type: "refund",
            amount: -(r.amount / 100),
            currency: (r.currency ?? order.currency ?? "SGD").toUpperCase(),
            stripeObjectId: r.id,
            metadata: {
              charge_id: charge.id,
              payment_intent: paymentIntentId,
              reason: r.reason ?? null,
            },
          });
          if (recorded) {
            newlyRecorded++;
            recordedNow.push(r);
            // If this refund was issued for an RMA (slice 06), settle it now that
            // the money has moved. Idempotent + best-effort: a redelivered event
            // no-ops (canTransition false) and RMA settlement never breaks money.
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

        if (newlyRecorded === 0) break;

        // Derive money state from the ledger: partially_refunded unless fully
        // refunded. Refunds NEVER auto-restock — restocking is a deliberate
        // manual action linked to the refund (slice 08).
        const state = await rollupOrderMoney(admin, order.id);
        const nowFullyRefunded = state.status === "refunded";

        // After the rollup: the clawback reads amount_refunded to tell a
        // refund already in the Order's earn base from a later one.
        await clawbackRefundPoints(admin, order.id, recordedNow);

        await addOrderTimelineEvent(
          order.id,
          nowFullyRefunded ? "refunded" : "partially_refunded",
          nowFullyRefunded
            ? "Order fully refunded via Stripe"
            : `Partial refund recorded via Stripe (${state.amountRefunded} of ${state.amountCaptured})`,
          {
            charge_id: charge.id,
            payment_intent: paymentIntentId,
            amount_refunded: state.amountRefunded,
          }
        );

        // On FULL refund only (first transition), reverse coupon usage and
        // recompute customer lifetime stats so reporting and coupon limits stay
        // accurate. Partial refunds leave both untouched.
        if (nowFullyRefunded && !wasFullyRefunded) {
          // Void the partner's commission on the whole reversed sale (#77). The
          // RMA path voids per-item; this covers a full refund with NO RMA link
          // (e.g. a staff Stripe-dashboard refund), which would otherwise pay
          // commission on a fully-refunded order. Idempotent + best-effort.
          if (order.partner_id) {
            try {
              await voidCommissionsForOrder(admin, order.id);
            } catch (err) {
              console.error(`[stripe/webhook] Commission void failed for ${order.id}:`, err);
            }
          }
          if (order.coupon_id) {
            const { data: coupon } = await admin
              .from("coupons")
              .select("usage_count")
              .eq("id", order.coupon_id)
              .single();
            if (coupon) {
              await admin
                .from("coupons")
                .update({ usage_count: Math.max(0, (coupon.usage_count ?? 0) - 1) })
                .eq("id", order.coupon_id);
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

        // Refund email (non-critical) — only when a new refund was recorded.
        try {
          await sendRefundEmail(order.id, order, state.amountRefunded, admin);
        } catch (err) {
          console.error(`[stripe/webhook] Refund email failed for ${order.id}:`, err);
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.order_id ?? null;

        // Fall back to payment_reference in case the order already stored it.
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

        // Only mark failure while still awaiting payment — never clobber a
        // confirmed/paid order (a later retry may have succeeded).
        if (order.status !== "pending") break;

        await admin
          .from("orders")
          .update({ status: "payment_failed" })
          .eq("id", order.id);

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

        // Disputes are revenue-affecting and time-sensitive — surface loudly.
        // TODO: wire to a real alert channel (email/Slack).
        console.error(
          `[stripe/webhook] DISPUTE opened for order ${order.id} (dispute ${dispute.id}, reason: ${dispute.reason})`
        );

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

        // Only the terminal outcomes move money; intermediate closes are ignored.
        if (dispute.status !== "won" && dispute.status !== "lost") break;

        // Dispute fee (e.g. SGD ~20) is charged regardless of outcome, surfaced
        // via the dispute's balance transactions.
        const feeMinor = (dispute.balance_transactions ?? []).reduce(
          (sum, bt) => sum + (bt.fee ?? 0),
          0
        );

        if (dispute.status === "won") {
          // Funds were only ever held by Stripe, now returned — our captured
          // charge stands, so no ledger debit. Restore the active status.
          await admin.from("orders").update({ status: "confirmed" }).eq("id", order.id);
        } else {
          // Lost: the charge is reversed. Record the loss against the ledger.
          await recordLedgerEntry(admin, order.id, {
            type: "dispute_loss",
            amount: -(dispute.amount / 100),
            currency: order.currency ?? "SGD",
            stripeObjectId: dispute.id,
            metadata: { reason: dispute.reason },
          });
        }

        if (feeMinor) {
          await recordLedgerEntry(admin, order.id, {
            type: "fee",
            amount: -(feeMinor / 100),
            currency: order.currency ?? "SGD",
            stripeObjectId: `${dispute.id}:fee`,
            metadata: { kind: "dispute_fee" },
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

        const { data: order } = paymentIntentId
          ? await admin
              .from("orders")
              .select("id, currency")
              .eq("payment_reference", paymentIntentId)
              .maybeSingle()
          : { data: null };

        if (order) {
          await admin.from("orders").update({ needs_attention: true }).eq("id", order.id);

          // If we optimistically recorded this refund as succeeded earlier, post a
          // compensating adjustment so the ledger reflects that the money never
          // actually moved, then recompute the rollup.
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
            });
            await rollupOrderMoney(admin, order.id);
          }

          await addOrderTimelineEvent(order.id, "refund_failed", detail, {
            refund_id: refund.id,
            failure_reason: refund.failure_reason ?? null,
          });
        }

        // Dead-letter for visibility regardless of whether we matched an order.
        await recordWebhookFailure(admin, event, detail);
        console.error(`[stripe/webhook] ${detail}`);

        break;
      }

      default:
        // Return 200 for all unhandled events
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error(`[stripe/webhook] Error handling ${event.type}:`, message);

    // Critical failures (order confirmation, inventory deduction) are
    // dead-lettered and answered with 500 so Stripe retries the event.
    if (err instanceof CriticalWebhookError) {
      await recordWebhookFailure(admin, event, message);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    // Non-critical / unexpected application-level errors: log and return 200 so
    // Stripe doesn't retry endlessly.
    return NextResponse.json({ ok: false, error: message });
  }

  return NextResponse.json({ ok: true, type: event.type });
}
