import type { SupabaseClient } from "@supabase/supabase-js";

import { whenLabel } from "@/lib/appointments/messages";
import { refundableAmount } from "@/lib/ecommerce/admin-refund";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { getEmailTransport } from "@/lib/email";
import { loadEmailCopy } from "@/lib/email/copy-store";
import {
  READJUSTMENT_CANCELLED_EMAIL_COPY,
  renderReadjustmentCancelledEmail,
  type CancelledFee,
} from "@/lib/email/readjustment";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { formatPointsCount, POINTS_PER_DOLLAR } from "@/lib/points/value";
import { intentPaymentMethodType, refundPayment } from "@/lib/stripe/refunds";
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
  email: string | null;
  location_name: string | null;
};

export const CANCELLED_BOOKING_COLUMNS =
  "id, complimentary, fee_order_id, start_at, guest_name, product_label, email, location_name";

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

type Fee = { amount: number; currency: string; orderNumber: string | null };

export type RefundOutcome =
  | { kind: "nothing" }
  | { kind: "already_settled" }
  | { kind: "visit_day"; fee: Fee }
  | { kind: "paynow"; fee: Fee }
  | { kind: "refunded"; refundId: string; fee: Fee }
  | { kind: "failed"; error: string; fee?: Fee };

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

export async function refundCancelledReadjustment(
  admin: SupabaseClient,
  booking: CancelledBooking,
  cancelledFrom: string,
  by: CancelledBy,
  now: Date = new Date(),
): Promise<RefundOutcome> {
  const outcome = await settleFee(admin, booking, cancelledFrom, by, now);
  await tellCustomer(booking, outcome);
  return outcome;
}

const CUSTOMER_LINE: Partial<Record<RefundOutcome["kind"], CancelledFee>> = {
  refunded: "refunded",
  visit_day: "visit_day",
  paynow: "paynow",
  failed: "refund_failed",
};

async function tellCustomer(booking: CancelledBooking, outcome: RefundOutcome) {
  const line = CUSTOMER_LINE[outcome.kind];
  const fee = "fee" in outcome ? outcome.fee : undefined;
  if (!line || !fee || !booking.email) return;
  try {
    const copy = await loadEmailCopy(READJUSTMENT_CANCELLED_EMAIL_COPY);
    await getEmailTransport().send({
      to: booking.email,
      from: getDefaultFromAddress(),
      ...renderReadjustmentCancelledEmail(
        {
          fee: line,
          guestName: booking.guest_name,
          productLabel: booking.product_label,
          visit: whenLabel(booking.start_at),
          locationName: booking.location_name,
          amount: fee.amount,
          currency: fee.currency,
          orderNumber: fee.orderNumber,
        },
        copy,
      ),
    });
  } catch (e) {
    console.error("[readjustment] cancel email", e instanceof Error ? e.message : e);
  }
}

// ponytail: the status move to `cancelled` is the claim and a failed Stripe call is not retried —
// Staff get a Telegram alert to refund from the Order by hand. Ceiling: a crash between the claim
// and the Stripe call leaves no alert. Upgrade path: a sweep over cancelled paid bookings whose
// fee Order is still confirmed.
async function settleFee(
  admin: SupabaseClient,
  booking: CancelledBooking,
  cancelledFrom: string,
  by: CancelledBy,
  now: Date,
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
    const fee: Fee = { amount, currency, orderNumber: order.order_number == null ? null : String(order.order_number) };

    if (decision === "staff_decides") {
      await sendTelegram(
        [
          "Paid re-adjustment cancelled by the customer on the visit day",
          who,
          `${orderRef} · ${sgd(amount, currency)} paid`,
          "Not refunded automatically: visit-day cancellations are refunded by hand only. They've been told our team will review it.",
        ].join("\n"),
      );
      await note(
        order.id,
        "readjustment_cancelled",
        "Re-adjustment cancelled by the customer on the visit day. Not refunded automatically.",
        { readjustment_booking_id: booking.id },
      );
      return { kind: "visit_day", fee };
    }

    const stripeFailed = async (e: unknown): Promise<RefundOutcome> => {
      const message = e instanceof Error ? e.message : String(e);
      await sendTelegram(
        [
          "⚠️ Automatic refund failed for a cancelled re-adjustment",
          who,
          `${orderRef} · ${sgd(amount, currency)}`,
          `Stripe: ${message}`,
          "Refund it from the Order today. They've been told our team will refund it.",
        ].join("\n"),
      );
      await note(order.id, "refund_failed", `Automatic refund failed: ${message}. Refund from the Order.`, {
        readjustment_booking_id: booking.id,
      });
      return { kind: "failed", error: message, fee };
    };

    let method: string | null;
    try {
      method = await intentPaymentMethodType(order.payment_reference);
    } catch (e) {
      return stripeFailed(e);
    }

    if (method === "paynow") {
      await sendTelegram(
        [
          "Paid re-adjustment cancelled — paid by PayNow, so not refunded automatically",
          who,
          `${orderRef} · ${sgd(amount, currency)} paid`,
          `Refund it by hand, or add ${formatPointsCount(Math.round(amount * POINTS_PER_DOLLAR))} on their customer page, then tell them which.`,
        ].join("\n"),
      );
      await note(
        order.id,
        "readjustment_cancelled",
        `Re-adjustment cancelled by ${by === "customer" ? "the customer" : "Staff"}. Paid by PayNow: refund by hand or add points.`,
        { readjustment_booking_id: booking.id },
      );
      return { kind: "paynow", fee };
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
      return { kind: "refunded", refundId: refund.id, fee: { ...fee, amount: refunded } };
    } catch (e) {
      return stripeFailed(e);
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
