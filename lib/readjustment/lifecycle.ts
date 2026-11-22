import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/server";

import {
  CANCELLED_BOOKING_COLUMNS,
  refundCancelledReadjustment,
  type CancelledBooking,
  type CancelledBy,
} from "./refund";

export async function markReadjustmentCancelledByEvent(
  calendarEventId: string,
  by: CancelledBy,
  admin: SupabaseClient = supabaseAdmin(),
  now: Date = new Date(),
): Promise<void> {
  let moved: CancelledBooking[];
  try {
    const { data, error } = await admin
      .from("readjustment_bookings")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("calendar_event_id", calendarEventId)
      .eq("status", "booked")
      .select(CANCELLED_BOOKING_COLUMNS);
    if (error) throw new Error(error.message);
    moved = (data ?? []) as CancelledBooking[];
  } catch (e) {
    console.error("[readjustment] cancel sync failed", e instanceof Error ? e.message : e);
    return;
  }
  for (const booking of moved) {
    await refundCancelledReadjustment(admin, booking, "booked", by, now);
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

export const STAFF_ACTIONS = {
  attended: { to: "attended", from: ["booked", "no_show"] },
  no_show: { to: "no_show", from: ["booked", "attended"] },
  cancel: { to: "cancelled", from: ["booked", "no_show", "needs_reschedule"] },
} as const;

export type StaffAction = keyof typeof STAFF_ACTIONS;
