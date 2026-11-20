import type { SupabaseClient } from "@supabase/supabase-js";

import { bookCalendarSlot, isSlotFree } from "@/lib/appointments/book-slot";
import {
  languagePreferenceNotes,
  parseLanguagePreference,
  type LanguagePreference,
} from "@/lib/appointments/language";
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

export const CHECKOUT_LIFETIME_MS = 30 * 60 * 1000;
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
  label: string;
  languagePreference: LanguagePreference;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}): Promise<{ sessionId: string; url: string }> {
  const currency = input.currency.toLowerCase();
  const metadata = {
    order_id: input.orderId,
    order_number: input.orderNumber,
    purpose: READJUSTMENT_PURPOSE,
    readjustment_booking_id: input.bookingId,
    language_preference: input.languagePreference,
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

export async function finalizeReadjustmentBooking(
  admin: SupabaseClient,
  bookingId: string,
  languagePreference?: string,
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
  const languageNotes = languagePreferenceNotes(parseLanguagePreference(languagePreference));

  if (booking.calendar_event_id) {
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
    if (!moved?.length) return "already_done";
    await sendTelegram(
      [
        "⚠️ Paid re-adjustment needs a new time",
        `${booking.guest_name} · ${booking.phone} · ${booking.email}`,
        `${booking.product_label} — wanted ${when(booking.start_at)} at ${booking.location_name}`,
        `Paid SGD ${Number(booking.fee_amount).toFixed(2)}${feeOrderNumber ? ` (Order #${feeOrderNumber})` : ""}`,
        ...languageNotes,
        "The slot was taken on the calendar while they paid. Call them to re-time it.",
      ].join("\n"),
    );
    try {
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
    notes: [...paidNotes(booking, feeOrderNumber), ...languageNotes],
    readjustmentBookingId: booking.id,
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

export async function expireReadjustmentBooking(admin: SupabaseClient, bookingId: string): Promise<void> {
  await admin
    .from("readjustment_bookings")
    .update({ status: "expired", hold_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "awaiting_payment");
}
