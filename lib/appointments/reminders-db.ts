import { supabaseAdmin } from "@/lib/supabase/server";
import type { AppointmentType } from "./settings";
import { LIVE_STATUSES, type ReminderStatus } from "./state";
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
  last_error: string | null;
  last_error_at: string | null;
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
  now: Date = new Date(),
): Promise<ReminderRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("appointment_reminders")
    .select("*")
    .eq("phone", e164)
    .in(
      "status",
      LIVE_STATUSES.filter((s) => s !== "pending"),
    )
    .gt("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ReminderRow | null;
}

export async function listLiveUpcomingReminders(
  now: Date,
  limit: number,
): Promise<ReminderRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("appointment_reminders")
    .select("*")
    .in("status", [...LIVE_STATUSES])
    .gt("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReminderRow[];
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
    last_error: string | null;
    last_error_at: string | null;
  }>,
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

export async function recordReminderError(
  calendarEventId: string,
  message: string,
): Promise<void> {
  await updateReminder(calendarEventId, {
    last_error: message.slice(0, 1000),
    last_error_at: new Date().toISOString(),
  });
}

export async function recordDeliveryFailure(waId: string, reason: string): Promise<number> {
  const admin = supabaseAdmin();
  const id = `"${waId.replace(/"/g, "")}"`;
  const { data, error } = await admin
    .from("appointment_reminders")
    .update({
      last_error: reason.slice(0, 1000),
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .or(`day_before_wa_id.eq.${id},morning_wa_id.eq.${id},last_wa_id.eq.${id}`)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function claimInboundMessage(
  messageId: string,
  e164: string,
  kind: string,
): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("whatsapp_inbound")
    .upsert(
      { message_id: messageId, phone: e164, kind },
      { onConflict: "message_id", ignoreDuplicates: true },
    )
    .select("message_id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function recordInboundOutcome(messageId: string, outcome: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("whatsapp_inbound")
    .update({ outcome: outcome.slice(0, 500) })
    .eq("message_id", messageId);
  if (error) throw new Error(error.message);
}

export async function lastInboundAt(e164: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("whatsapp_inbound")
    .select("received_at")
    .eq("phone", e164)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.received_at as string | undefined) ?? null;
}

// ponytail: read-then-write, so two messages landing in the same instant can both claim and get two
// replies; a conditional upsert behind an RPC would close that if it ever matters.
export async function claimAutoReply(e164: string, cooldownMs: number): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("whatsapp_auto_replies")
    .select("sent_at")
    .eq("phone", e164)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const last = data ? Date.parse(data.sent_at as string) : NaN;
  if (Number.isFinite(last) && Date.now() - last < cooldownMs) return false;

  const { error: upErr } = await admin
    .from("whatsapp_auto_replies")
    .upsert({ phone: e164, sent_at: new Date().toISOString() }, { onConflict: "phone" });
  if (upErr) throw new Error(upErr.message);
  return true;
}
