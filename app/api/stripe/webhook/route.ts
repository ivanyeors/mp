import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { createMpConfigFromCustomization } from "@/lib/ecommerce/mp-config-sync";
import { updateCustomerStats } from "@/lib/ecommerce/customers";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { reconcileOrderTotal, sessionTotals } from "@/lib/stripe/reconcile";
import { sendOrderConfirmedEmails, sendRefundEmail } from "@/lib/email";
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const resultId = session.metadata?.result_id;
        const orderId = session.metadata?.order_id;

        // Result authorization hold (manual-capture PI) — attach PI id, do not create an order.
        if (resultId && !orderId) {
          const paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          if (paymentIntent) {
            await admin
              .from("mp_config_responses")
              .update({ payment_intent_id: paymentIntent })
              .eq("id", resultId)
              .eq("status", "held");
          }
          break;
        }

        if (!orderId) break;

        // Fetch order with items
        const { data: order } = await admin
          .from("orders")
          .select(
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, total, status, paid_at, coupon_id, customer_id, shipping_address, tracking_number, tracking_url, order_items(*)"
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

        const items = (order.order_items ?? []) as Array<{
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;

        // Step 2 (CRITICAL): Deduct inventory (idempotent — check if transactions already exist)
        const { count: existingTxCount } = await admin
          .from("inventory_transactions")
          .select("id", { count: "exact", head: true })
          .eq("metadata->>order_id", orderId);

        if ((existingTxCount ?? 0) === 0) {
          try {
            await deductInventoryForOrder(orderId, items);
          } catch (err) {
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

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .single();

        if (!order || order.status !== "pending") break;

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
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, total, status, coupon_id, customer_id, shipping_address, order_items(*)"
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
          if (recorded) newlyRecorded++;
        }

        if (newlyRecorded === 0) break;

        // Derive money state from the ledger: partially_refunded unless fully
        // refunded. Refunds NEVER auto-restock — restocking is a deliberate
        // manual action linked to the refund (slice 08).
        const state = await rollupOrderMoney(admin, order.id);
        const nowFullyRefunded = state.status === "refunded";

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
