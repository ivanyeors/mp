import type { SupabaseClient } from "@supabase/supabase-js";

import { refundableAmount } from "@/lib/ecommerce/admin-refund";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { refundPayment } from "@/lib/stripe/refunds";
import { sendTelegram } from "@/lib/telegram/notify";

import { sgtDate } from "./eligibility";

export type CancelledBy = "customer" | "staff";

export type CancelledBooking = {
  id: string;
  complimentary: boolean;
  fee_order_id: string | null;
  start_at: string;
  guest_name: string;
  product_label: string;
};

export const CANCELLED_BOOKING_COLUMNS = "id, complimentary, fee_order_id, start_at, guest_name, product_label";

export type CancellationRefund = "refund" | "staff_decides" | "nothing";

export function cancellationRefund(
  booking: Pick<CancelledBooking, "complimentary" | "fee_order_id" | "start_at">,
  cancelledFrom: string,
  by: CancelledBy,
  now: Date,
): CancellationRefund {
  if (booking.complimentary || !booking.fee_order_id) return "nothing";
  if (cancelledFrom === "needs_reschedule") return "refund";
  if (cancelledFrom !== "booked") return "nothing";
  if (now.getTime() >= Date.parse(booking.start_at)) return "nothing";
  if (by === "staff") return "refund";
  return sgtDate(now) < sgtDate(booking.start_at) ? "refund" : "staff_decides";
}

export type RefundOutcome =
  | { kind: "nothing" }
  | { kind: "already_settled" }
  | { kind: "staff_alerted" }
  | { kind: "refunded"; refundId: string; amount: number }
  | { kind: "failed"; error: string };

type FeeOrder = {
  id: string;
  order_number: string | number | null;
  status: string;
  payment_reference: string | null;
  currency: string | null;
  total: number;
  amount_captured: number | null;
  amount_refunded: number | null;
};

const NOT_REFUNDABLE = new Set(["pending", "payment_failed", "cancelled", "refunded"]);

const sgd = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

async function note(orderId: string, eventType: string, message: string, metadata: Record<string, unknown>) {
  await addOrderTimelineEvent(orderId, eventType, message, metadata).catch((e) =>
    console.error("[readjustment] order timeline", e instanceof Error ? e.message : e),
  );
}

// ponytail: the status move to `cancelled` is the claim and a failed Stripe call is not retried —
// Staff get a Telegram alert to refund from the Order by hand. Ceiling: a crash between the claim
// and the Stripe call leaves no alert. Upgrade path: a sweep over cancelled paid bookings whose
// fee Order is still confirmed.
export async function refundCancelledReadjustment(
  admin: SupabaseClient,
  booking: CancelledBooking,
  cancelledFrom: string,
  by: CancelledBy,
  now: Date = new Date(),
): Promise<RefundOutcome> {
  const decision = cancellationRefund(booking, cancelledFrom, by, now);
  if (decision === "nothing") return { kind: "nothing" };

  const who = `${booking.guest_name} · ${booking.product_label}`;
  try {
    const { data, error } = await admin
      .from("orders")
      .select("id, order_number, status, payment_reference, currency, total, amount_captured, amount_refunded")
      .eq("id", booking.fee_order_id!)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const order = data as FeeOrder | null;
    if (!order || !order.payment_reference || NOT_REFUNDABLE.has(order.status)) {
      return { kind: "already_settled" };
    }
    const amount = refundableAmount(order);
    if (amount <= 0) return { kind: "already_settled" };
    const currency = String(order.currency ?? "SGD").toUpperCase();
    const orderRef = `Order #${order.order_number ?? "?"}`;

    if (decision === "staff_decides") {
      await sendTelegram(
        [
          "Paid re-adjustment cancelled by the customer on the day of the visit",
          who,
          `${orderRef} · ${sgd(amount, currency)} paid`,
          "Not refunded automatically. Refund from the Order if appropriate.",
        ].join("\n"),
      );
      await note(
        order.id,
        "readjustment_cancelled",
        "Re-adjustment cancelled by the customer on the day of the visit. Not refunded automatically.",
        { readjustment_booking_id: booking.id },
      );
      return { kind: "staff_alerted" };
    }

    try {
      const refund = await refundPayment({
        paymentIntentId: order.payment_reference,
        idempotencyKey: `readjustment_cancel_refund_${booking.id}`,
        ...(by === "customer" ? { reason: "requested_by_customer" as const } : {}),
        metadata: {
          order_id: order.id,
          order_number: String(order.order_number ?? ""),
          readjustment_booking_id: booking.id,
          refund_reason: by === "customer" ? "readjustment_cancelled_by_customer" : "readjustment_cancelled_by_staff",
        },
      });
      const refunded = refund.amount / 100;
      await note(
        order.id,
        "refund_initiated",
        `Refunded ${sgd(refunded, currency)} automatically: re-adjustment cancelled by ${
          by === "customer" ? "the customer" : "Staff"
        }`,
        {
          stripe_refund_id: refund.id,
          stripe_refund_ids: [refund.id],
          amount: refunded,
          readjustment_booking_id: booking.id,
        },
      );
      return { kind: "refunded", refundId: refund.id, amount: refunded };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await sendTelegram(
        [
          "⚠️ Automatic refund failed for a cancelled re-adjustment",
          who,
          `${orderRef} · ${sgd(amount, currency)}`,
          `Stripe: ${message}`,
          "Refund it from the Order today.",
        ].join("\n"),
      );
      await note(order.id, "refund_failed", `Automatic refund failed: ${message}. Refund from the Order.`, {
        readjustment_booking_id: booking.id,
      });
      return { kind: "failed", error: message };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[readjustment] refund", message);
    await sendTelegram(
      [
        "⚠️ Couldn't check the refund for a cancelled re-adjustment",
        who,
        `Booking ${booking.id}: ${message}`,
        "Check the fee Order and refund it by hand.",
      ].join("\n"),
    );
    return { kind: "failed", error: message };
  }
}
