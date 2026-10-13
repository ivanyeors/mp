/**
 * Book one slot on the central calendar: the `freeBusy` re-check, the event, the
 * pending WhatsApp reminder, the immediate confirmation and the Contacts sync.
 *
 * Shared by the guest booking route and both re-adjustment routes (ADR 0024) so a
 * re-adjustment is reminded, confirmed and contact-synced exactly like any other
 * Appointment. Slot holds a paying customer has while Checkout is open count as
 * busy here too.
 */

import { createEvent, freeBusy } from "@/lib/appointments/calendar";
import { syncGuestContact, type ContactSyncResult } from "@/lib/appointments/contacts";
import { formatDateSgt, formatTimeSgt } from "@/lib/appointments/format";
import { isPhoneAllowed } from "@/lib/appointments/phone";
import { upsertPendingReminder } from "@/lib/appointments/reminders-db";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import { sendTemplateMessage } from "@/lib/appointments/whatsapp";
import type { ApptType } from "@/lib/appointments/appt-type";
import { supabaseAdmin } from "@/lib/supabase/server";

export type SlotInterval = { startMs: number; endMs: number };

/** Re-adjustment slot holds whose Checkout is still open (ADR 0024). */
export async function liveSlotHolds(fromIso: string, toIso: string, excludeBookingId?: string): Promise<SlotInterval[]> {
  let q = supabaseAdmin()
    .from("readjustment_bookings")
    .select("id, start_at, end_at")
    .eq("status", "awaiting_payment")
    .gt("hold_expires_at", new Date().toISOString())
    .lt("start_at", toIso)
    .gt("end_at", fromIso);
  if (excludeBookingId) q = q.neq("id", excludeBookingId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    startMs: Date.parse(r.start_at as string),
    endMs: Date.parse(r.end_at as string),
  }));
}

/** Is [start, end) free on the calendar and of live holds? */
export async function isSlotFree(
  startIso: string,
  endIso: string,
  opts?: { excludeBookingId?: string },
): Promise<boolean> {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const [busy, holds] = await Promise.all([
    freeBusy(startIso, endIso),
    liveSlotHolds(startIso, endIso, opts?.excludeBookingId),
  ]);
  return ![...busy, ...holds].some((b) => startMs < b.endMs && endMs > b.startMs);
}

export type BookSlotInput = {
  startIso: string;
  endIso: string;
  location: { id: string; address: string };
  guestName: string;
  /** Normalized phone. */
  phone: string;
  email: string;
  appointmentType: ApptType;
  settings: AppointmentSettings;
  /** Extra description lines Staff read at the visit. */
  notes?: string[];
  readjustmentBookingId?: string;
};

export type BookSlotResult = { eventId: string; contact: ContactSyncResult | "failed" };

/**
 * Write the event and everything that rides on it. The caller has already
 * checked the slot is free; this does not re-check, so the paid path can decide
 * what a conflict means (money taken) separately from the free one (refuse).
 */
export async function bookCalendarSlot(input: BookSlotInput): Promise<BookSlotResult> {
  const typeLabel =
    input.appointmentType === "readjustment"
      ? input.settings.readjustmentSummaryMatch
      : input.settings.customisationSummaryMatch;
  const summary = `${input.guestName} - ${typeLabel}`;

  const eventId = await createEvent({
    startIso: input.startIso,
    endIso: input.endIso,
    summary,
    locationAddress: input.location.address,
    locationId: input.location.id,
    guestName: input.guestName,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    readjustmentBookingId: input.readjustmentBookingId,
  });

  await upsertPendingReminder({
    calendarEventId: eventId,
    phone: input.phone,
    guestName: input.guestName,
    appointmentType: input.appointmentType,
    startsAt: new Date(Date.parse(input.startIso)).toISOString(),
  });

  // Best-effort immediate WhatsApp confirmation. A web booking has no open 24h
  // service window, so this must be an approved template — dormant until
  // WHATSAPP_TEMPLATE_CONFIRM names one (e.g. appointment_confirmation). Without
  // it, short-notice bookers get no message at all (the daily reminder cron only
  // fires the day-before/morning-of and skips same-day/pending rows). Never let a
  // send failure fail the booking. Params match the 4-slot day_before shape.
  // Also honours the Settings → Appointments kill switch, so turning
  // notifications off silences this path too, not just the cron and webhook.
  const confirmTemplate = process.env.WHATSAPP_TEMPLATE_CONFIRM?.trim();
  if (input.settings.whatsappEnabled && confirmTemplate && isPhoneAllowed(input.phone)) {
    try {
      await sendTemplateMessage(input.phone, confirmTemplate, [
        input.guestName,
        formatDateSgt(input.startIso),
        formatTimeSgt(input.startIso),
        typeLabel,
      ]);
    } catch (e) {
      console.error("[appointments/book] confirmation send", e instanceof Error ? e.message : e);
    }
  }

  // Google Contacts (admin@mpillow.com): create / update / skip the guest so the
  // WhatsApp Business inbox shows their name. Best-effort — never fails the booking.
  let contact: ContactSyncResult | "failed" = "failed";
  try {
    contact = await syncGuestContact({ name: input.guestName, phone: input.phone, email: input.email });
  } catch (ce) {
    console.error(
      `[appointments/book] contact sync failed for ${eventId}:`,
      ce instanceof Error ? ce.message : ce,
    );
  }

  return { eventId, contact };
}
