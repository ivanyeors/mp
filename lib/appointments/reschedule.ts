import type { SupabaseClient } from "@supabase/supabase-js";

import { isSlotFree } from "@/lib/appointments/book-slot";
import { getGuestBooking, moveEvent, type GuestBooking } from "@/lib/appointments/calendar";
import { isPhoneAllowed } from "@/lib/appointments/phone";
import { getReminderByEventId, updateReminder } from "@/lib/appointments/reminders-db";
import { sendDayBeforeReminder, sendMorningOfReminder } from "@/lib/appointments/remind";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { isOfferableSlot } from "@/lib/appointments/slots";
import { LIVE_STATUSES, missedReminder } from "@/lib/appointments/state";
import { matchAppointmentType } from "@/lib/appointments/type";
import { getLocation } from "@/lib/locations";
import { sgtDate } from "@/lib/readjustment/eligibility";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendTelegram } from "@/lib/telegram/notify";

export type BookingOwner = { customerId: string; email: string };

export type RescheduleRequest = { eventId: string; startIso: string; endIso: string; locationId: string };

export type RescheduleRefusal = "not_found" | "closed" | "not_bookable" | "location" | "taken";

export type RescheduleOutcome =
  | { ok: true; startsAt: string; endsAt: string; locationName: string }
  | { ok: false; reason: RescheduleRefusal };

export function changeWindowOpen(startsAt: string, now: Date): boolean {
  return sgtDate(now) < sgtDate(startsAt);
}

export function isCustomisationEvent(summary: string, settings: AppointmentSettings): boolean {
  return matchAppointmentType(summary, settings)?.type === "customisation";
}

type OwnedBooking = { event: GuestBooking; readjustmentBookingId: string | null };

export async function findOwnedBooking(
  eventId: string,
  owner: BookingOwner,
  settings: AppointmentSettings,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<OwnedBooking | null> {
  const event = await getGuestBooking(eventId);
  if (!event || event.state !== "live") return null;

  const lookup = admin.from("readjustment_bookings").select("id, customer_id, status, calendar_event_id");
  const { data, error } = await (event.readjustmentBookingId
    ? lookup.eq("id", event.readjustmentBookingId)
    : lookup.eq("calendar_event_id", event.id)
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (data || event.readjustmentBookingId) {
    const owned =
      data?.customer_id === owner.customerId && data.status === "booked" && data.calendar_event_id === event.id;
    return owned ? { event, readjustmentBookingId: data.id as string } : null;
  }

  const email = owner.email.trim().toLowerCase();
  const mine = !!email && event.guestEmail === email && isCustomisationEvent(event.summary, settings);
  return mine ? { event, readjustmentBookingId: null } : null;
}

export async function rescheduleOwnBooking(
  req: RescheduleRequest,
  owner: BookingOwner,
  now: Date = new Date(),
  admin: SupabaseClient = supabaseAdmin(),
): Promise<RescheduleOutcome> {
  const settings = await getAppointmentSettings();
  const owned = await findOwnedBooking(req.eventId, owner, settings, admin);
  if (!owned) return { ok: false, reason: "not_found" };
  const { event } = owned;
  if (!changeWindowOpen(event.startsAt, now)) return { ok: false, reason: "closed" };

  const startMs = Date.parse(req.startIso);
  const endMs = Date.parse(req.endIso);
  const own = { startMs: Date.parse(event.startsAt), endMs: Date.parse(event.endsAt) };
  const sameTime = startMs === own.startMs && endMs === own.endMs;
  if (!sameTime && !isOfferableSlot(req.startIso, req.endIso, settings, now)) {
    return { ok: false, reason: "not_bookable" };
  }
  const location = await getLocation(req.locationId);
  if (!location?.address || !location.bookable) return { ok: false, reason: "location" };

  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  if (!(await isSlotFree(startIso, endIso, { ignore: own }))) return { ok: false, reason: "taken" };

  await moveEvent(event.id, startIso, endIso, { id: location.id, address: location.address }, event.privateProps);

  if (owned.readjustmentBookingId) {
    const { data, error } = await admin
      .from("readjustment_bookings")
      .update({
        start_at: startIso,
        end_at: endIso,
        location_id: location.id,
        location_name: location.name,
        updated_at: now.toISOString(),
      })
      .eq("id", owned.readjustmentBookingId)
      .eq("status", "booked")
      .select("id");
    if (error || !data?.length) {
      await sendTelegram(
        [
          "⚠️ A customer moved their re-adjustment, but the booking record wasn't updated",
          `Booking ${owned.readjustmentBookingId} → ${startIso} at ${location.name}`,
          error ? `Database: ${error.message}` : "The booking was no longer booked when the change was saved.",
          "The calendar has the new time; check the booking in the Admin Panel.",
        ].join("\n"),
      );
    }
  }

  await rearmReminder(event, { startIso, venue: location.address }, settings, now);

  return { ok: true, startsAt: startIso, endsAt: endIso, locationName: location.name };
}

async function rearmReminder(
  event: GuestBooking,
  next: { startIso: string; venue: string },
  settings: AppointmentSettings,
  now: Date,
) {
  try {
    const reminder = await getReminderByEventId(event.id);
    if (!reminder || !LIVE_STATUSES.includes(reminder.status)) return;
    const claimed = await updateReminder(
      event.id,
      { status: "rescheduled", starts_at: next.startIso, offered_slots: null },
      reminder.status,
    );
    if (!claimed || !settings.whatsappEnabled || !isPhoneAllowed(reminder.phone)) return;
    const missed = missedReminder(Date.parse(next.startIso), now.getTime());
    const target = {
      calendarEventId: event.id,
      phone: reminder.phone,
      guestName: reminder.guest_name,
      startsAt: next.startIso,
    };
    if (missed === "day_before") {
      const typeLabel = matchAppointmentType(event.summary, settings)?.label ?? "appointment";
      await sendDayBeforeReminder({ ...target, typeLabel, from: "rescheduled" }, now);
    } else if (missed === "morning_of") {
      await sendMorningOfReminder({ ...target, venue: next.venue, from: "rescheduled" }, now);
    }
  } catch (e) {
    console.error("[appointments/reschedule] reminder", e instanceof Error ? e.message : e);
  }
}
