import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { refundPayment } from "@/lib/stripe/refunds";
import { getStripe } from "@/lib/stripe/client";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import {
  refundableAmount,
  cancelRefundIdempotencyKey,
  isPaidOrder,
} from "@/lib/ecommerce/admin-refund";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await params;
  const admin = supabaseAdmin();

  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, payment_reference, paid_at, total, amount_refunded, amount_captured, currency, status, stripe_session_id"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Order is already cancelled" }, { status: 400 });
  }

  if (order.status === "refunded") {
    return NextResponse.json({ error: "Order is already refunded" }, { status: 400 });
  }

  if (isPaidOrder(order)) {
    const remaining = refundableAmount(order);
    if (remaining <= 0) {
      return NextResponse.json({ error: "Nothing left to refund" }, { status: 400 });
    }

    const amountCents = Math.round(remaining * 100);
    const stripeRefund = await refundPayment({
      paymentIntentId: order.payment_reference!,
      idempotencyKey: cancelRefundIdempotencyKey(orderId, amountCents),
      reason: "requested_by_customer",
      metadata: { order_id: orderId, cancel: "true" },
    });

    await addOrderTimelineEvent(
      orderId,
      "cancel_initiated",
      `Staff cancelled paid order — full refund initiated (${remaining} ${order.currency})`,
      { stripe_refund_id: stripeRefund.id, amount: remaining }
    );

    return NextResponse.json({
      ok: true,
      refunded: true,
      stripe_refund_id: stripeRefund.id,
      amount: remaining,
    });
  }

  // Close the Order's Checkout first, so it cannot be paid after it is
  // cancelled (its points come back on cancel, and the webhook would otherwise
  // find a paid Order nobody means to fulfil).
  if (order.stripe_session_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (session.status === "complete") {
        return NextResponse.json(
          { error: "This order was just paid. Refresh the page; cancelling it now refunds it." },
          { status: 409 },
        );
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(order.stripe_session_id);
    } catch (err) {
      console.error(`[orders/cancel] Could not close the Checkout for ${orderId}:`, err);
      return NextResponse.json(
        { error: "Could not close this order's Stripe Checkout. Try again in a moment." },
        { status: 502 },
      );
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("orders")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await addOrderTimelineEvent(
    orderId,
    "cancelled",
    "Staff cancelled unpaid order — no money moved",
    {}
  );

  return NextResponse.json({ ok: true, refunded: false, row: updated });
}
