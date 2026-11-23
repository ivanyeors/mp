import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { refundableAmount } from "@/lib/ecommerce/admin-refund";
import { updateCustomerStats } from "@/lib/ecommerce/customers";
import { decrementCouponUsage } from "@/lib/ecommerce/discounts";
import { recordLedgerEntry, rollupOrderMoney } from "@/lib/ecommerce/money-ledger";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { clawbackPointsForRefund } from "@/lib/points/earn";
import {
  OUTSIDE_STRIPE_METHOD_LABELS,
  OUTSIDE_STRIPE_SOURCE,
  isOutsideStripeMethod,
  paidOutsideStripe,
} from "@/lib/ecommerce/outside-stripe";
import { scheduleLabelCancel } from "@/lib/shipping/schedule-labels";

export const RecordRefundSchema = z.object({
  amount: z.number().positive("Enter the amount returned.").max(1_000_000),
  note: z.string().trim().min(1, "Say how the money was returned.").max(500),
});
export type RecordRefundInput = z.infer<typeof RecordRefundSchema>;

export type RecordRefundOutcome =
  | { ok: true; amount: number; fullyRefunded: boolean }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): RecordRefundOutcome => ({ ok: false, status, error });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function recordOutsideRefund(
  admin: SupabaseClient,
  orderId: string,
  input: RecordRefundInput,
  actor: { email: string },
  now: Date = new Date(),
  rmaRequestId?: string,
): Promise<RecordRefundOutcome> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, status, paid_at, payment_method, currency, total, amount_captured, amount_refunded, coupon_id, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return refuse(500, error.message);
  if (!order) return refuse(404, "Order not found");
  if (!paidOutsideStripe(order)) {
    return refuse(400, "Only an order paid outside Stripe has its refund recorded by hand. Use Refund for this one.");
  }
  if (order.status === "refunded") return refuse(400, "Order is already fully refunded");

  const currency = String(order.currency ?? "SGD").toUpperCase();
  const remaining = refundableAmount(order);
  const amount = round2(input.amount);
  if (amount < 0.01 || amount > remaining) {
    return refuse(400, `Record between 0.01 and ${remaining.toFixed(2)} ${currency}.`);
  }

  const refundedBefore = Number(order.amount_refunded ?? 0);
  const { data: claimed, error: claimError } = await admin
    .from("orders")
    .update({ amount_refunded: round2(refundedBefore + amount) })
    .eq("id", orderId)
    .eq("amount_refunded", refundedBefore)
    .select("id");
  if (claimError) return refuse(500, claimError.message);
  if (!claimed?.length) return refuse(409, "This order's refunds changed while you were recording this one. Refresh the page.");

  const method = isOutsideStripeMethod(order.payment_method) ? order.payment_method : "other";
  try {
    await recordLedgerEntry(admin, orderId, {
      type: "refund",
      amount: -amount,
      currency,
      metadata: {
        source: OUTSIDE_STRIPE_SOURCE,
        method,
        note: input.note,
        recorded_by: actor.email,
        ...(rmaRequestId ? { rma_request_id: rmaRequestId } : {}),
      },
      occurredAt: now.toISOString(),
    });
  } catch (err) {
    await rollupOrderMoney(admin, orderId);
    return refuse(500, `The refund could not be recorded: ${err instanceof Error ? err.message : String(err)}`);
  }

  const state = await rollupOrderMoney(admin, orderId);
  const fullyRefunded = state.status === "refunded";

  const clawback = await clawbackPointsForRefund(admin, {
    orderId,
    refundId: `outside_${crypto.randomUUID()}`,
    amount,
  });
  if ("error" in clawback) console.error(`[record-refund] Points not taken back on ${orderId}: ${clawback.error}`);

  await addOrderTimelineEvent(
    orderId,
    fullyRefunded ? "refunded" : "partially_refunded",
    `${actor.email} recorded a refund of ${amount.toFixed(2)} ${currency}, returned outside Stripe ` +
      `(${OUTSIDE_STRIPE_METHOD_LABELS[method]}). No money moved through Stripe. Note: ${input.note}`,
    { source: OUTSIDE_STRIPE_SOURCE, amount, amount_refunded: state.amountRefunded, recorded_by: actor.email },
  );

  if (fullyRefunded) {
    scheduleLabelCancel(admin, orderId);
    if (order.coupon_id) {
      await decrementCouponUsage(order.coupon_id).catch((err) =>
        console.error(`[record-refund] Coupon usage decrement failed for ${orderId}:`, err),
      );
    }
    if (order.customer_id) {
      await updateCustomerStats(order.customer_id).catch((err) =>
        console.error(`[record-refund] Customer stats update failed for ${orderId}:`, err),
      );
    }
  }

  return { ok: true, amount, fullyRefunded };
}

export async function refundRecordedForReturn(
  admin: SupabaseClient,
  orderId: string,
  rmaRequestId: string,
): Promise<number | null> {
  const { data, error } = await admin.from("order_payments").select("amount, metadata").eq("order_id", orderId).eq("type", "refund");
  if (error) throw new Error(`Couldn't read the order's refunds: ${error.message}`);
  const row = ((data ?? []) as Array<{ amount: number | string; metadata: { rma_request_id?: string } | null }>).find(
    (r) => r.metadata?.rma_request_id === rmaRequestId,
  );
  return row ? Math.abs(Number(row.amount)) : null;
}
