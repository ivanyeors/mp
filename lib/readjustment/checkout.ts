/**
 * Paid re-adjustment (ADR 0024): a pending Order with one Service fee line,
 * settled by the same `checkout.session.completed` branch every shop order uses.
 * The only new webhook work is what happens after the money is in — book the slot.
 *
 * The slot is held in `readjustment_bookings` (not on the calendar) while
 * Checkout is open, so no Google invite goes out for an abandoned checkout.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { bookCalendarSlot, isSlotFree } from "@/lib/appointments/book-slot";
import { upsertPendingReminder } from "@/lib/appointments/reminders-db";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { toStripeAmountCents } from "@/lib/authorization-hold";
import { getEmailTransport } from "@/lib/email";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { READJUSTMENT_RESCHEDULE_EMAIL_COPY, renderReadjustmentRescheduleEmail } from "@/lib/email/readjustment";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { getLocation } from "@/lib/locations";
import { getStripe } from "@/lib/stripe/client";
import { sendTelegram } from "@/lib/telegram/notify";

/** Stripe's minimum Checkout lifetime. */
export const CHECKOUT_LIFETIME_MS = 30 * 60 * 1000;
/** The hold outlives the Session a little, so a payment made in its last second still has its slot. */
export const HOLD_LIFETIME_MS = CHECKOUT_LIFETIME_MS + 2 * 60 * 1000;

export const READJUSTMENT_PURPOSE = "readjustment";

export async function createReadjustmentCheckoutSession(input: {
  amount: number;
  tax: number;
  currency: string;
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  bookingId: string;
  /** What is being re-adjusted, for the line description. */
  label: string;
  successUrl: string;
  cancelUrl: string;
  /** Session expiry; at least 30 minutes out. */
  expiresAt: Date;
}): Promise<{ sessionId: string; url: string }> {
  const currency = input.currency.toLowerCase();
  const metadata = {
    order_id: input.orderId,
    order_number: input.orderNumber,
    purpose: READJUSTMENT_PURPOSE,
    readjustment_booking_id: input.bookingId,
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeAmountCents(input.amount),
            product_data: { name: "Re-adjustment service", description: input.label },
          },
        },
        ...(input.tax > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency,
                  unit_amount: toStripeAmountCents(input.tax),
                  product_data: { name: "Tax" },
                },
              },
            ]
          : []),
      ],
      metadata,
      // Mirrored so payment_intent.* events can find the Order too.
      payment_intent_data: { metadata },
      expires_at: Math.ceil(input.expiresAt.getTime() / 1000),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { idempotencyKey: `readjustment-checkout-${input.bookingId}` },
  );
  if (!session.url) throw new Error("Checkout session missing url");
  return { sessionId: session.id, url: session.url };
}

type BookingRow = {
  id: string;
  status: string;
  calendar_event_id: string | null;
  start_at: string;
  end_at: string;
  location_id: string | null;
  location_name: string;
  guest_name: string;
  phone: string;
  email: string;
  product_label: string;
  purchase_source: string;
  order_number: string | null;
  purchase_paid_at: string | null;
  unlisted_where: string | null;
  unlisted_reference: string | null;
  fee_amount: number | string;
  fee_order_id: string | null;
};

const BOOKING_COLUMNS =
  "id, status, calendar_event_id, start_at, end_at, location_id, location_name, guest_name, phone, email, product_label, purchase_source, order_number, purchase_paid_at, unlisted_where, unlisted_reference, fee_amount, fee_order_id";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/** Description lines for a paid booking, from the booking row alone. */
function paidNotes(b: BookingRow, feeOrderNumber: string | null): string[] {
  const purchase =
    b.purchase_source === "platform"
      ? [
          `Re-adjustment: ${b.product_label}`,
          `Order #${b.order_number ?? "?"}${
            b.purchase_paid_at
              ? ` · bought ${new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }).format(new Date(b.purchase_paid_at))}`
              : ""
          }`,
        ]
      : [
          "Re-adjustment: pillow not listed on the customer's account",
          `Bought: ${b.unlisted_where ?? "unknown"}${b.unlisted_reference ? ` · ref ${b.unlisted_reference}` : ""}`,
          "Check proof of purchase at the visit.",
        ];
  return [
    ...purchase,
    `Paid SGD ${Number(b.fee_amount).toFixed(2)}${feeOrderNumber ? ` · Order #${feeOrderNumber}` : ""}`,
  ];
}

export type FinalizeOutcome = "booked" | "needs_reschedule" | "already_done" | "not_found";

/**
 * The money is in: put the paid booking on the calendar. Idempotent — a replayed
 * webhook finds the event already written and does nothing. If someone wrote
 * straight into the calendar while the customer paid, the booking becomes
 * `needs_reschedule`, Staff are alerted, and the money stays on a real Order.
 */
export async function finalizeReadjustmentBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<FinalizeOutcome> {
  const { data, error } = await admin
    .from("readjustment_bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const booking = data as BookingRow | null;
  if (!booking) return "not_found";
  if (booking.status !== "awaiting_payment") return "already_done";

  const { data: feeOrder } = booking.fee_order_id
    ? await admin.from("orders").select("order_number").eq("id", booking.fee_order_id).maybeSingle()
    : { data: null };
  const feeOrderNumber = (feeOrder?.order_number as string | undefined) ?? null;

  if (booking.calendar_event_id) {
    // An earlier attempt put the visit on the calendar (the invite went out) and
    // failed after. Finish that booking — never treat its own event as a clash.
    await upsertPendingReminder({
      calendarEventId: booking.calendar_event_id,
      phone: booking.phone,
      guestName: booking.guest_name,
      appointmentType: "readjustment",
      startsAt: new Date(Date.parse(booking.start_at)).toISOString(),
    });
    return markBooked(admin, booking.id);
  }

  const location = booking.location_id ? await getLocation(booking.location_id) : null;
  const address = location?.address ?? null;

  const free =
    !!address && (await isSlotFree(booking.start_at, booking.end_at, { excludeBookingId: booking.id }));
  if (!free) {
    const { data: moved, error: moveErr } = await admin
      .from("readjustment_bookings")
      .update({ status: "needs_reschedule", hold_expires_at: null, updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "awaiting_payment")
      .select("id");
    if (moveErr) throw new Error(moveErr.message);
    // A concurrent delivery already moved it and told everyone; say nothing twice.
    if (!moved?.length) return "already_done";
    await sendTelegram(
      [
        "⚠️ Paid re-adjustment needs a new time",
        `${booking.guest_name} · ${booking.phone} · ${booking.email}`,
        `${booking.product_label} — wanted ${when(booking.start_at)} at ${booking.location_name}`,
        `Paid SGD ${Number(booking.fee_amount).toFixed(2)}${feeOrderNumber ? ` (Order #${feeOrderNumber})` : ""}`,
        "The slot was taken on the calendar while they paid. Call them to re-time it.",
      ].join("\n"),
    );
    try {
      // The words Staff saved on Email templates, or the defaults (never throws).
      const copy = await loadEmailCopy(READJUSTMENT_RESCHEDULE_EMAIL_COPY);
      await getEmailTransport().send({
        to: booking.email,
        from: getDefaultFromAddress(),
        ...renderReadjustmentRescheduleEmail(
          {
            guestName: booking.guest_name,
            productLabel: booking.product_label,
            wanted: when(booking.start_at),
            locationName: booking.location_name,
            amount: Number(booking.fee_amount),
            currency: "SGD",
            orderNumber: feeOrderNumber,
          },
          copy,
        ),
      });
    } catch (e) {
      console.error("[readjustment] reschedule email failed", e);
    }
    return "needs_reschedule";
  }

  await bookCalendarSlot({
    startIso: booking.start_at,
    endIso: booking.end_at,
    location: { id: booking.location_id!, address: address! },
    guestName: booking.guest_name,
    phone: booking.phone,
    email: booking.email,
    appointmentType: "readjustment",
    settings: await getAppointmentSettings(),
    notes: paidNotes(booking, feeOrderNumber),
    readjustmentBookingId: booking.id,
    // Recorded before anything else can fail, so a webhook retry finishes this
    // booking rather than finding its own event in the way.
    onEventCreated: async (eventId) => {
      const { error: idErr } = await admin
        .from("readjustment_bookings")
        .update({ calendar_event_id: eventId, updated_at: new Date().toISOString() })
        .eq("id", booking.id);
      if (idErr) throw new Error(idErr.message);
    },
  });
  return markBooked(admin, booking.id);
}

/** awaiting_payment → booked, guarded; an error must reach the webhook so Stripe retries. */
async function markBooked(admin: SupabaseClient, bookingId: string): Promise<FinalizeOutcome> {
  const { data, error } = await admin
    .from("readjustment_bookings")
    .update({ status: "booked", hold_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "awaiting_payment")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ? "booked" : "already_done";
}

/** Checkout expired unpaid: release the slot. The existing branch cancels the Order. */
export async function expireReadjustmentBooking(admin: SupabaseClient, bookingId: string): Promise<void> {
  await admin
    .from("readjustment_bookings")
    .update({ status: "expired", hold_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "awaiting_payment");
}
