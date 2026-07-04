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
import {
  operatorApproveDeniedReason,
  operatorRejectDeniedReason,
} from "@/lib/results/post-delivery-refund";

export const runtime = "nodejs";

const BodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  /** Required for approve — records in-person return (US18/US35). */
  in_person_return_acknowledged: z.boolean().optional(),
});

/**
 * Operator decide on a customer refund request.
 * Approve → existing refundPayment (ledger via Stripe webhook). Reject → no money moved.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, payment_reference, total, amount_refunded, currency, status, shipped_at, delivered_at, refund_request_status, items:order_items(customization_snapshot)",
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const items = order.items ?? [];

  if (parsed.data.action === "reject") {
    const rejectDenied = operatorRejectDeniedReason(order, items);
    if (rejectDenied) {
      return NextResponse.json({ error: rejectDenied }, { status: 400 });
    }

    const { error: updErr } = await admin
      .from("orders")
      .update({ refund_request_status: "rejected" })
      .eq("id", orderId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await addOrderTimelineEvent(
      orderId,
      "refund_request_rejected",
      "Staff rejected customer refund request — payment unchanged.",
      {},
    );

    return NextResponse.json({ ok: true, action: "reject" });
  }

  const approveDenied = operatorApproveDeniedReason(
    order,
    items,
    parsed.data.in_person_return_acknowledged === true,
  );
  if (approveDenied) {
    return NextResponse.json({ error: approveDenied }, { status: 400 });
  }

  if (!order.payment_reference) {
    return NextResponse.json({ error: "Order has no payment to refund" }, { status: 400 });
  }

  const remaining = refundableAmount(order);
  if (remaining <= 0) {
    return NextResponse.json({ error: "Nothing left to refund" }, { status: 400 });
  }

  const amountCents = Math.round(remaining * 100);
  const now = new Date().toISOString();

  const stripeRefund = await refundPayment({
    paymentIntentId: order.payment_reference,
    idempotencyKey: refundIdempotencyKey(orderId, amountCents),
    reason: "requested_by_customer",
    metadata: {
      order_id: orderId,
      refund_request: "approved",
      in_person_return: "true",
    },
  });

  const { error: updErr } = await admin
    .from("orders")
    .update({
      refund_request_status: "approved",
      refund_return_acknowledged_at: now,
    })
    .eq("id", orderId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Ledger row is written by the Stripe webhook — single source of truth.
  await addOrderTimelineEvent(
    orderId,
    "refund_initiated",
    `Staff approved refund request after in-person return (${remaining} ${order.currency})`,
    {
      stripe_refund_id: stripeRefund.id,
      amount: remaining,
      in_person_return_acknowledged: true,
    },
  );

  return NextResponse.json({
    ok: true,
    action: "approve",
    stripe_refund_id: stripeRefund.id,
    amount: remaining,
    currency: order.currency,
  });
}
