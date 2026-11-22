import { markReadjustmentCancelledByEvent } from "@/lib/readjustment/lifecycle";
import { deleteEvent, type EventState } from "./calendar";
import { isPhoneAllowed } from "./phone";
import {
  getReminderByEventId,
  lastInboundAt,
  updateReminder,
  type ReminderRow,
} from "./reminders-db";
import { sendOrRecord } from "./remind";
import type { AppointmentSettings } from "./settings";
import { transitionReminder } from "./state";
import { appointmentTypeInfo } from "./type";
import { sendCancelMessage, withinServiceWindow } from "./whatsapp";

export type CancelCause = "guest" | "declined" | "removed";

export type CancelOutcome =
  | { kind: "cancelled"; messaged: boolean }
  | { kind: "not_live" }
  | { kind: "past" };

export async function cancelAppointment(
  row: ReminderRow,
  settings: AppointmentSettings,
  opts: {
    cause: CancelCause;
    within24h?: boolean;
    now?: Date;
  },
): Promise<CancelOutcome> {
  const now = opts.now ?? new Date();
  if (!(Date.parse(row.starts_at) > now.getTime())) return { kind: "past" };

  const t = transitionReminder(row.status, { type: "cancel" });
  if (!t.ok || t.noop) return { kind: "not_live" };

  if (opts.cause !== "removed") await deleteEvent(row.calendar_event_id);
  await markReadjustmentCancelledByEvent(
    row.calendar_event_id,
    opts.cause === "removed" ? "staff" : "customer",
    undefined,
    now,
  );

  const claimed = await updateReminder(
    row.calendar_event_id,
    { status: "cancelled", offered_slots: null },
    row.status,
  );
  if (!claimed) return { kind: "not_live" };

  if (!settings.whatsappEnabled || !isPhoneAllowed(row.phone)) {
    return { kind: "cancelled", messaged: false };
  }

  const within24h =
    opts.within24h ?? withinServiceWindow(await lastInboundAt(row.phone), now.getTime());
  const type = appointmentTypeInfo(row.appointment_type, settings);
  const waId = await sendOrRecord(row.calendar_event_id, () =>
    sendCancelMessage(
      row.phone,
      {
        guestName: row.guest_name,
        typeLabel: type.label,
        startsAt: row.starts_at,
        bookingUrl: type.bookingUrl,
      },
      { within24h },
    ),
  );
  await updateReminder(row.calendar_event_id, {
    last_wa_id: waId,
    last_outbound_at: now.toISOString(),
    last_error: null,
    last_error_at: null,
  });
  return { kind: "cancelled", messaged: true };
}

export async function cancelFromCalendar(
  eventId: string,
  state: EventState,
  settings: AppointmentSettings,
  now: Date = new Date(),
): Promise<CancelOutcome | null> {
  if (state === "live") return null;
  const row = await getReminderByEventId(eventId);
  if (!row) return null;
  return cancelAppointment(row, settings, {
    cause: state === "declined" ? "declined" : "removed",
    now,
  });
}
