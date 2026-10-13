/**
 * Keep a Re-adjustment booking in step with its calendar event (ADR 0024).
 *
 * The event is the appointment; the booking is what it means. When a customer
 * cancels through WhatsApp the event goes, and a complimentary booking must give
 * its free visit back — that only happens if the booking leaves `booked`. When
 * they reschedule, the booking's times follow. Best-effort: a failure here must
 * never break the WhatsApp flow that already changed the calendar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/server";

export async function markReadjustmentCancelledByEvent(
  calendarEventId: string,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<void> {
  try {
    await admin
      .from("readjustment_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("calendar_event_id", calendarEventId)
      .eq("status", "booked");
  } catch (e) {
    console.error("[readjustment] cancel sync failed", e instanceof Error ? e.message : e);
  }
}

export async function moveReadjustmentByEvent(
  calendarEventId: string,
  startIso: string,
  endIso: string,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<void> {
  try {
    await admin
      .from("readjustment_bookings")
      .update({ start_at: startIso, end_at: endIso, updated_at: new Date().toISOString() })
      .eq("calendar_event_id", calendarEventId);
  } catch (e) {
    console.error("[readjustment] reschedule sync failed", e instanceof Error ? e.message : e);
  }
}

/** Staff actions at the visit. Each moves only from the states it makes sense from. */
export const STAFF_ACTIONS = {
  attended: { to: "attended", from: ["booked", "no_show"] },
  no_show: { to: "no_show", from: ["booked", "attended"] },
  cancel: { to: "cancelled", from: ["booked", "no_show", "needs_reschedule"] },
} as const;

export type StaffAction = keyof typeof STAFF_ACTIONS;
