import { supabaseAdmin } from "@/lib/supabase/server";
import type { AppointmentType } from "./settings";
import type { ReminderStatus } from "./state";
import type { SlotOffer } from "./slots";

export type ReminderRow = {
  id: string;
  calendar_event_id: string;
  phone: string;
  guest_name: string;
  appointment_type: AppointmentType;
  starts_at: string;
  status: ReminderStatus;
  offered_slots: SlotOffer[] | null;
  day_before_wa_id: string | null;
  morning_wa_id: string | null;
  last_wa_id: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getReminderByEventId(
  calendarEventId: string,
): Promise<ReminderRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("appointment_reminders")
    .select("*")
    .eq("calendar_event_id", calendarEventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ReminderRow | null;
}

export async function getOpenReminderByPhone(
  e164: string,
): Promise<ReminderRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("appointment_reminders")
    .select("*")
    .eq("phone", e164)
    .in("status", ["reminded", "offering_slots", "morning_sent"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ReminderRow | null;
}

export async function upsertPendingReminder(input: {
  calendarEventId: string;
  phone: string;
  guestName: string;
  appointmentType: AppointmentType;
  startsAt: string;
}): Promise<ReminderRow> {
  const admin = supabaseAdmin();
  const existing = await getReminderByEventId(input.calendarEventId);
  if (existing) return existing;

  const { data, error } = await admin
    .from("appointment_reminders")
    .upsert(
      {
        calendar_event_id: input.calendarEventId,
        phone: input.phone,
        guest_name: input.guestName,
        appointment_type: input.appointmentType,
        starts_at: input.startsAt,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "calendar_event_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as ReminderRow;

  const again = await getReminderByEventId(input.calendarEventId);
  if (!again) throw new Error("Failed to upsert appointment_reminders row");
  return again;
}

export async function updateReminder(
  calendarEventId: string,
  patch: Partial<{
    status: ReminderStatus;
    phone: string;
    guest_name: string;
    starts_at: string;
    offered_slots: SlotOffer[] | null;
    day_before_wa_id: string | null;
    morning_wa_id: string | null;
    last_wa_id: string | null;
    last_outbound_at: string | null;
  }>,
  /** Optional optimistic lock on current status. */
  expectStatus?: ReminderStatus,
): Promise<boolean> {
  const admin = supabaseAdmin();
  let q = admin
    .from("appointment_reminders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("calendar_event_id", calendarEventId);
  if (expectStatus) q = q.eq("status", expectStatus);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
