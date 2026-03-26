import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { deductInventoryForOrder, restoreInventoryForOrder } from "@/lib/ecommerce/inventory-deduction";
import { createMpConfigFromCustomization } from "@/lib/ecommerce/mp-config-sync";
import type Stripe from "stripe";

export const runtime = "nodejs";

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

        // Idempotency: check if order is already paid
        const { data: order } = await admin
          .from("orders")
          .select("id, status, paid_at, coupon_id, shipping_address, order_items(*)")
          .eq("id", orderId)
          .single();

        if (!order || order.paid_at) break; // Already processed

        const paymentIntent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        // Update order to confirmed
        await admin
          .from("orders")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            payment_method: "stripe",
            payment_reference: paymentIntent,
          })
          .eq("id", orderId);

        // Deduct inventory using BOM-aware logic
        const items = (order.order_items ?? []) as Array<{
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;

        await deductInventoryForOrder(orderId, items);

        // Auto-create mp-config responses for customized items
        const orderItemsForSync = (order.order_items ?? []) as Array<{
          id: string;
          variant_id: string;
          quantity: number;
          customization_id?: string | null;
          customization_snapshot?: Record<string, unknown> | null;
        }>;
        const shippingAddr = order.shipping_address as { recipient?: string } | null;
        await createMpConfigFromCustomization(orderId, orderItemsForSync, shippingAddr);

        // Increment coupon usage if applicable
        if (order.coupon_id) {
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

        // Add timeline event
        await addOrderTimelineEvent(
          orderId,
          "payment_confirmed",
          "Payment confirmed via Stripe",
          { stripe_session_id: session.id, payment_intent: paymentIntent }
        );

        // Clear cart if cart token in metadata
        const cartToken = session.metadata?.cart_token;
        if (cartToken) {
          await admin.from("carts").delete().eq("token", cartToken);
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
          .select("id, status, order_items(*)")
          .eq("payment_reference", paymentIntentId)
          .single();

        if (!order) break;

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

        break;
      }

      default:
        // Return 200 for all unhandled events
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error(`[stripe/webhook] Error handling ${event.type}:`, message);
    // Still return 200 so Stripe doesn't retry endlessly for application-level errors
    return NextResponse.json({ ok: false, error: message });
  }

  return NextResponse.json({ ok: true, type: event.type });
}
