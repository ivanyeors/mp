import { createEvent, freeBusy } from "@/lib/appointments/calendar";
import { syncGuestContact, type ContactSyncResult } from "@/lib/appointments/contacts";
import { formatDateSgt, formatTimeSgt } from "@/lib/appointments/format";
import { isPhoneAllowed } from "@/lib/appointments/phone";
import { upsertPendingReminder } from "@/lib/appointments/reminders-db";
import { sendDayBeforeReminder, sendMorningOfReminder } from "@/lib/appointments/remind";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import { missedReminder } from "@/lib/appointments/state";
import { resolveAppointmentType } from "@/lib/appointments/type";
import { sendTemplateMessage } from "@/lib/appointments/whatsapp";
import type { ApptType } from "@/lib/appointments/appt-type";
import { supabaseAdmin } from "@/lib/supabase/server";

export type SlotInterval = { startMs: number; endMs: number };

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
  phone: string;
  email: string;
  appointmentType: ApptType;
  settings: AppointmentSettings;
  notes?: string[];
  readjustmentBookingId?: string;
  onEventCreated?: (eventId: string) => Promise<void>;
};

export type BookSlotResult = { eventId: string; contact: ContactSyncResult | "failed" };

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
  await input.onEventCreated?.(eventId);

  const startsAt = new Date(Date.parse(input.startIso)).toISOString();
  await upsertPendingReminder({
    calendarEventId: eventId,
    phone: input.phone,
    guestName: input.guestName,
    appointmentType: input.appointmentType,
    startsAt,
  });

  const canMessage = input.settings.whatsappEnabled && isPhoneAllowed(input.phone);

  const missed = canMessage ? missedReminder(Date.parse(startsAt), Date.now()) : null;
  const target = {
    calendarEventId: eventId,
    phone: input.phone,
    guestName: input.guestName,
    startsAt,
  };
  if (missed) {
    try {
      if (missed === "day_before") {
        const { label } = resolveAppointmentType(summary, input.settings);
        await sendDayBeforeReminder({ ...target, typeLabel: label });
      } else {
        await sendMorningOfReminder({
          ...target,
          venue: input.location.address,
          from: "pending",
        });
      }
    } catch (e) {
      console.error(`[appointments/book] ${missed} send`, e instanceof Error ? e.message : e);
    }
  }

  const confirmTemplate = process.env.WHATSAPP_TEMPLATE_CONFIRM?.trim();
  if (canMessage && !missed && confirmTemplate) {
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
