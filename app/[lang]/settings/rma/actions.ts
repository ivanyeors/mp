"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { refundPayment } from "@/lib/stripe/refunds";
import { refundableAmount } from "@/lib/ecommerce/admin-refund";
import { recordOutsideRefund } from "@/lib/ecommerce/outside-refund";
import { paidOutsideStripe } from "@/lib/ecommerce/outside-stripe";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { applyRmaTransition } from "@/lib/rma/transition";
import { rmaRefundAmount, type RmaRefundLine, type RmaRefundOrder } from "@/lib/rma/refund";
import { getSiteSettings } from "@/lib/site-settings";

export async function saveAdminNote(rmaId: string, note: string) {
  const actor = await assertAdmin("returns");
  const admin = supabaseAdmin();

  const { data: before } = await admin
    .from("rma_requests")
    .select("id, admin_note")
    .eq("id", rmaId)
    .maybeSingle();

  const { data, error } = await admin
    .from("rma_requests")
    .update({ admin_note: note })
    .eq("id", rmaId)
    .select("id, admin_note")
    .single();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "rma.note",
    entityType: "rma_request",
    entityId: rmaId,
    before,
    after: { admin_note: data.admin_note },
  });

  revalidatePath(`/settings/rma/${rmaId}`);
  return { ok: true };
}

async function staffTransition(opts: {
  rmaId: string;
  to: Parameters<typeof applyRmaTransition>[1]["to"];
  reason?: string | null;
  emailMessage?: string | null;
  patch?: Record<string, unknown>;
}) {
  const actor = await assertAdmin("returns");
  const admin = supabaseAdmin();
  const res = await applyRmaTransition(admin, { ...opts, actorType: "staff", actor });
  if (!res.ok) throw new Error(res.error ?? "Transition failed.");
  revalidatePath(`/settings/rma/${opts.rmaId}`);
  return res;
}

export async function approveRma(rmaId: string) {
  return staffTransition({ rmaId, to: "approved" });
}

export async function rejectRma(rmaId: string, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A rejection reason is required.");
  return staffTransition({ rmaId, to: "rejected", reason: trimmed });
}

export async function sendInstructions(rmaId: string) {
  const settings = await getSiteSettings(["rma_return_address"]);
  const address = settings.rma_return_address?.trim();
  const message = address
    ? `Please ship the item(s) back to:\n\n${address}\n\nInclude your order number so we can match the return.`
    : "Please reply to this email and our team will share the return address and next steps.";
  return staffTransition({ rmaId, to: "instructions_sent", emailMessage: message });
}

export async function markReceived(rmaId: string) {
  return staffTransition({ rmaId, to: "received" });
}

export async function completeReturn(rmaId: string, trackingNumber: string, trackingUrl: string) {
  const admin = supabaseAdmin();
  const { data: r } = await admin
    .from("rma_requests")
    .select("resolution")
    .eq("id", rmaId)
    .maybeSingle();
  if (r?.resolution === "refund") {
    throw new Error("Refund returns settle via Issue refund, not tracking.");
  }
  return staffTransition({
    rmaId,
    to: "completed",
    patch: {
      tracking_number: trackingNumber.trim() || null,
      tracking_url: trackingUrl.trim() || null,
    },
  });
}

export async function issueRmaRefund(rmaId: string) {
  const actor = await assertAdmin("returns");
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("rma_requests")
    .select(
      "id, status, resolution, orders(id, payment_reference, paid_at, payment_method, subtotal, shipping_amount, discount_amount, points_discount, self_purchase_units, total, amount_refunded, amount_captured, currency, coupons!coupon_id(applies_to), order_items(id, quantity, total_price, unit_price, kind, customization_snapshot)), rma_request_items(order_item_id, quantity)",
    )
    .eq("id", rmaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Return not found.");
  const rma = data as unknown as {
    status: string;
    resolution: string;
    orders:
      | (RmaRefundOrder & {
          id: string;
          payment_reference: string | null;
          paid_at: string | null;
          payment_method: string | null;
          amount_refunded: number | null;
          amount_captured: number | null;
          currency: string;
          order_items: RmaRefundLine[];
        })
      | null;
    rma_request_items: Array<{ order_item_id: string; quantity: number }>;
  };

  if (rma.resolution !== "refund") throw new Error("This return is not a refund.");
  if (rma.status !== "received") throw new Error("Mark the return received before issuing the refund.");
  const order = rma.orders;
  const outsideStripe = Boolean(order) && paidOutsideStripe(order!) && !order!.payment_reference;
  if (!order || (!order.payment_reference && !outsideStripe)) throw new Error("Order has no payment to refund.");

  const remaining = refundableAmount(order);
  const requested = rmaRefundAmount(order, order.order_items ?? [], rma.rma_request_items);
  const amount = Math.min(requested, remaining);
  if (!(amount > 0)) throw new Error("Nothing left to refund on this order.");

  if (outsideStripe) {
    const recorded = await recordOutsideRefund(
      admin,
      order.id,
      { amount, note: `Return ${rmaId}: money returned the way it was paid.` },
      { email: actor.email },
    );
    if (!recorded.ok) throw new Error(recorded.error);
    await applyRmaTransition(admin, {
      rmaId,
      to: "refunded",
      actorType: "staff",
      actor,
      emailMessage: "We have returned your payment the way you paid it.",
    });
    revalidatePath(`/settings/rma/${rmaId}`);
    return { ok: true, amount };
  }

  const amountCents = Math.round(amount * 100);
  const isFull = amountCents >= Math.round(remaining * 100);

  if (!order.payment_reference) throw new Error("Order has no payment to refund.");
  const refund = await refundPayment({
    paymentIntentId: order.payment_reference,
    ...(isFull ? {} : { amount }),
    idempotencyKey: `rma_refund_${rmaId}`,
    reason: "requested_by_customer",
    metadata: { order_id: order.id, rma_request_id: rmaId },
  });

  await recordAdminAction({
    actor,
    action: "rma.refund_initiated",
    entityType: "rma_request",
    entityId: rmaId,
    before: { status: rma.status },
    after: { stripe_refund_id: refund.id, amount },
  });

  await addOrderTimelineEvent(
    order.id,
    "refund_initiated",
    `Staff issued RMA refund (${amount} ${order.currency})`,
    { stripe_refund_id: refund.id, rma_request_id: rmaId, amount },
  );

  revalidatePath(`/settings/rma/${rmaId}`);
  return { ok: true, amount };
}

export async function approveRmaForm(rmaId: string, _formData: FormData) {
  await approveRma(rmaId);
}
export async function rejectRmaForm(rmaId: string, formData: FormData) {
  await rejectRma(rmaId, String(formData.get("reason") ?? ""));
}
export async function sendInstructionsForm(rmaId: string, _formData: FormData) {
  await sendInstructions(rmaId);
}
export async function markReceivedForm(rmaId: string, _formData: FormData) {
  await markReceived(rmaId);
}
export async function completeReturnForm(rmaId: string, formData: FormData) {
  await completeReturn(
    rmaId,
    String(formData.get("tracking_number") ?? ""),
    String(formData.get("tracking_url") ?? ""),
  );
}
export async function issueRmaRefundForm(rmaId: string, _formData: FormData) {
  await issueRmaRefund(rmaId);
}

export async function saveAdminNoteForm(rmaId: string, formData: FormData) {
  await saveAdminNote(rmaId, String(formData.get("note") ?? ""));
}
