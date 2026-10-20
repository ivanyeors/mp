/**
 * An appointment is off — the guest typed "cancel" or turned down every new
 * time, declined the calendar invite, or the event left the calendar (the guest
 * cancelled a Google booking, or staff deleted it). One path for all of them, so
 * the guest hears it exactly once, with a rebook link and the staffed line, and
 * no reminder follows.
 *
 * Order matters. The calendar goes first, so a cancellation that dies halfway
 * still frees the slot, and the event's removal comes back through the push
 * notification and finishes the job. The row is then claimed under its status
 * lock before anything is sent: a push, the cron and a WhatsApp reply can all
 * arrive for the same cancellation, and only the one that moves the row speaks.
 */

import { markReadjustmentCancelledByEvent } from "@/lib/readjustment/lifecycle";
import { deleteEvent, type EventState } from "./calendar";
import { formatDateSgt, formatTimeSgt } from "./format";
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

/**
 * - `guest`: asked over WhatsApp. The event is ours to delete.
 * - `declined`: said No to the invite. The event is still there holding the
 *   slot; delete it (Google tells the guest) so someone else can book.
 * - `removed`: the event is already gone.
 */
export type CancelCause = "guest" | "declined" | "removed";

export type CancelOutcome =
  /** Cancelled now; `messaged` says whether the guest was told. */
  | { kind: "cancelled"; messaged: boolean }
  /** Already over, or someone else just cancelled it. Nothing done. */
  | { kind: "not_live" }
  /** The visit has passed: an old event tidied away is not news to the guest. */
  | { kind: "past" };

export async function cancelAppointment(
  row: ReminderRow,
  settings: AppointmentSettings,
  opts: {
    cause: CancelCause;
    /** The guest just messaged us, so free text is allowed. Else looked up. */
    within24h?: boolean;
    now?: Date;
  },
): Promise<CancelOutcome> {
  const now = opts.now ?? new Date();
  if (!(Date.parse(row.starts_at) > now.getTime())) return { kind: "past" };

  const t = transitionReminder(row.status, { type: "cancel" });
  if (!t.ok || t.noop) return { kind: "not_live" };

  if (opts.cause !== "removed") await deleteEvent(row.calendar_event_id);
  // The visit is gone: a complimentary Re-adjustment gives its free visit back.
  await markReadjustmentCancelledByEvent(row.calendar_event_id);

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
        whenLabel: `${formatDateSgt(row.starts_at)} at ${formatTimeSgt(row.starts_at)}`,
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

/**
 * What the calendar says about an event we may hold a row for: an event that was
 * deleted, or that the guest declined, cancels a live row. Null when there is
 * nothing to act on (still on, or not an appointment we track).
 */
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
