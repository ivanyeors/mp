import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductInventoryForOrder, restoreInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { createMpConfigFromCustomization } from "@/lib/ecommerce/mp-config-sync";
import { updateCustomerStats } from "@/lib/ecommerce/customers";
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
        const orderId = session.metadata?.order_id;

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

        // Step 1 (CRITICAL): Update order to confirmed (idempotent — skip if already paid)
        if (!order.paid_at) {
          const { error: confirmError } = await admin
            .from("orders")
            .update({
              status: "confirmed",
              paid_at: new Date().toISOString(),
              payment_method: "stripe",
              payment_reference: paymentIntent,
            })
            .eq("id", orderId);

          if (confirmError) {
            throw new CriticalWebhookError(
              `Failed to confirm order ${orderId}: ${confirmError.message}`
            );
          }
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
          const { data: coupon } = await admin
            .from("coupons")
            .select("usage_count")
            .eq("id", order.coupon_id)
            .single();

          if (coupon) {
            await admin
              .from("coupons")
              .update({ usage_count: (coupon.usage_count ?? 0) + 1 })
              .eq("id", order.coupon_id);
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
            "id, order_number, email, currency, subtotal, shipping_amount, tax_amount, discount_amount, total, status, shipping_address, order_items(*)"
          )
          .eq("payment_reference", paymentIntentId)
          .single();

        if (!order) break;

        const alreadyRefunded = order.status === "refunded";

        await admin
          .from("orders")
          .update({ status: "refunded" })
          .eq("id", order.id);

        // Restore inventory using BOM-aware logic
        const refundItems = (order.order_items ?? []) as Array<{
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;

        await restoreInventoryForOrder(order.id, refundItems);

        await addOrderTimelineEvent(
          order.id,
          "refunded",
          "Order refunded via Stripe",
          { charge_id: charge.id, payment_intent: paymentIntentId }
        );

        // Refund email (idempotent, non-critical). Skip if already refunded so
        // a re-delivered event doesn't re-attempt.
        if (!alreadyRefunded) {
          try {
            const refundAmount =
              typeof charge.amount_refunded === "number"
                ? charge.amount_refunded / 100
                : null;
            await sendRefundEmail(order.id, order, refundAmount, admin);
          } catch (err) {
            console.error(`[stripe/webhook] Refund email failed for ${order.id}:`, err);
          }
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
