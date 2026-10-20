/**
 * Send one reminder and move its row on — the shared tail of the daily cron and
 * the booking path (bookCalendarSlot), so both advance status, stamp message ids
 * and record failures the same way.
 *
 * On success the row advances under an optimistic lock on the status it was read
 * at, and any earlier error clears. On failure the provider's error is written
 * to the row and rethrown; the row keeps its status, so a later run can still
 * reach the guest (a `pending` row on the day gets the morning-of).
 */

import { formatDateSgt, formatTimeSgt } from "./format";
import { recordReminderError, updateReminder } from "./reminders-db";
import { transitionReminder, type ReminderStatus } from "./state";
import { sendDayBeforeTemplate, sendMorningOfTemplate } from "./whatsapp";

type ReminderTarget = {
  calendarEventId: string;
  /** Normalized E.164. */
  phone: string;
  guestName: string;
  startsAt: string;
};

export async function sendOrRecord(
  calendarEventId: string,
  send: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await send();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await recordReminderError(calendarEventId, message);
    } catch (re) {
      console.error(
        `[appointments/remind] could not record error for ${calendarEventId}:`,
        re instanceof Error ? re.message : re,
      );
    }
    throw e;
  }
}

/**
 * Day-before template (Confirm / Reschedule) to a `pending` row, or one moved
 * over WhatsApp to a later day (`rescheduled`) → `reminded`.
 */
export async function sendDayBeforeReminder(
  target: ReminderTarget & { typeLabel: string; from?: ReminderStatus },
  now: Date = new Date(),
): Promise<boolean> {
  const from = target.from ?? "pending";
  const t = transitionReminder(from, { type: "day_before_sent" });
  if (!t.ok || t.noop) throw new Error(t.error ?? `day-before already sent (${from})`);

  const waId = await sendOrRecord(target.calendarEventId, () =>
    sendDayBeforeTemplate(target.phone, {
      guestName: target.guestName,
      dateLabel: formatDateSgt(target.startsAt),
      timeLabel: formatTimeSgt(target.startsAt),
      typeLabel: target.typeLabel,
    }),
  );

  // False = another worker advanced the row first; the guest still got this one.
  return updateReminder(
    target.calendarEventId,
    {
      status: "reminded",
      phone: target.phone,
      guest_name: target.guestName,
      starts_at: target.startsAt,
      day_before_wa_id: waId,
      last_wa_id: waId,
      last_outbound_at: now.toISOString(),
      last_error: null,
      last_error_at: null,
    },
    from,
  );
}

/** Morning-of template to a silent `reminded` or never-reached `pending` row. */
export async function sendMorningOfReminder(
  target: ReminderTarget & { venue: string; from: ReminderStatus },
  now: Date = new Date(),
): Promise<boolean> {
  const t = transitionReminder(target.from, { type: "morning_of_sent" });
  if (!t.ok || t.noop) return false;

  const waId = await sendOrRecord(target.calendarEventId, () =>
    sendMorningOfTemplate(target.phone, {
      guestName: target.guestName,
      dateLabel: formatDateSgt(target.startsAt),
      timeLabel: formatTimeSgt(target.startsAt),
      venue: target.venue,
    }),
  );

  return updateReminder(
    target.calendarEventId,
    {
      status: "morning_sent",
      morning_wa_id: waId,
      last_wa_id: waId,
      last_outbound_at: now.toISOString(),
      last_error: null,
      last_error_at: null,
    },
    target.from,
  );
}
