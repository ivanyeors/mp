import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { refundPayment } from "@/lib/stripe/refunds";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import {
  refundableAmount,
  refundIdempotencyKey,
} from "@/lib/ecommerce/admin-refund";
import { directRefundDeniedReason } from "@/lib/results/post-delivery-refund";

export const runtime = "nodejs";

const RefundSchema = z.object({
  /** Major units (e.g. dollars). Omit for a full refund of the remaining balance. */
  amount: z.number().positive().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
  /** Required for Result (customised) orders — use refund-request approve instead. */
  in_person_return_acknowledged: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = RefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, payment_reference, total, amount_refunded, amount_captured, currency, status, shipped_at, delivered_at, refund_request_status, items:order_items(customization_snapshot)",
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const resultGate = directRefundDeniedReason(
    order,
    order.items ?? [],
    parsed.data.in_person_return_acknowledged === true,
  );
  if (resultGate) {
    return NextResponse.json(
      {
        error: `${resultGate} Use POST /refund-request with action=approve.`,
      },
      { status: 400 },
    );
  }

  if (!order.payment_reference) {
    return NextResponse.json({ error: "Order has no payment to refund" }, { status: 400 });
  }

  if (order.status === "refunded") {
    return NextResponse.json({ error: "Order is already fully refunded" }, { status: 400 });
  }

  const remaining = refundableAmount(order);
  if (remaining <= 0) {
    return NextResponse.json({ error: "Nothing left to refund" }, { status: 400 });
  }

  const refundAmount =
    parsed.data.amount != null
      ? Math.min(parsed.data.amount, remaining)
      : remaining;

  if (refundAmount <= 0 || refundAmount > remaining) {
    return NextResponse.json(
      { error: `Refund amount must be between 0.01 and ${remaining}` },
      { status: 400 }
    );
  }

  const amountCents = Math.round(refundAmount * 100);
  const isFullRefund = amountCents >= Math.round(remaining * 100);
  const now = new Date().toISOString();

  const stripeRefund = await refundPayment({
    paymentIntentId: order.payment_reference,
    ...(isFullRefund ? {} : { amount: refundAmount }),
    idempotencyKey: refundIdempotencyKey(orderId, amountCents),
    reason: parsed.data.reason,
    metadata: { order_id: orderId },
  });

  if (order.refund_request_status === "requested") {
    await admin
      .from("orders")
      .update({
        refund_request_status: "approved",
        refund_return_acknowledged_at: now,
      })
      .eq("id", orderId);
  }

  // Ledger row is written by the Stripe webhook — single source of truth.
  await addOrderTimelineEvent(
    orderId,
    "refund_initiated",
    isFullRefund
      ? `Staff initiated full refund (${refundAmount} ${order.currency})`
      : `Staff initiated partial refund (${refundAmount} ${order.currency})`,
    { stripe_refund_id: stripeRefund.id, amount: refundAmount }
  );

  return NextResponse.json({
    ok: true,
    stripe_refund_id: stripeRefund.id,
    amount: refundAmount,
    currency: order.currency,
  });
}
