import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { getSiteSettings } from "@/lib/site-settings";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { isPhoneAllowed, normalizePhone } from "@/lib/appointments/phone";
import {
  getEventState,
  listDayEvents,
  venueForEvent,
  type CalendarGuestEvent,
  type EventState,
} from "@/lib/appointments/calendar";
import { ensureCalendarWatch, type WatchResult } from "@/lib/appointments/calendar-watch";
import { cancelAppointment } from "@/lib/appointments/cancel";
import { syncGuestContact } from "@/lib/appointments/contacts";
import { sweepUpcomingContacts } from "@/lib/appointments/contacts-sweep";
import { sendDayBeforeReminder, sendMorningOfReminder } from "@/lib/appointments/remind";
import {
  LIVE_STATUSES,
  isDayBeforeEligible,
  isMorningOfEligible,
} from "@/lib/appointments/state";
import {
  getReminderByEventId,
  listLiveUpcomingReminders,
  updateReminder,
  upsertPendingReminder,
  type ReminderRow,
} from "@/lib/appointments/reminders-db";

/** Most rows the cancellation sweep checks one by one against Google per run. */
const SWEEP_LIMIT = 100;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  return secretMatches(`Bearer ${secret}`, req.headers.get("authorization"));
}

/**
 * The event's reminder row, created `pending` the first time a run sees it. An
 * unusable phone is logged once as `skipped_invalid_phone`; a phone the non-prod
 * allowlist blocks gets no row at all.
 */
async function prepareRow(
  ev: CalendarGuestEvent,
): Promise<{ row: ReminderRow; phone: string } | "skipped"> {
  const phone = normalizePhone(ev.phone);
  if (!phone) {
    await upsertPendingReminder({
      calendarEventId: ev.id,
      phone: ev.phone || "invalid",
      guestName: ev.guestName,
      appointmentType: ev.appointmentType,
      startsAt: ev.startsAt,
    });
    await updateReminder(ev.id, { status: "skipped_invalid_phone" }, "pending");
    return "skipped";
  }
  if (!isPhoneAllowed(phone)) return "skipped";

  const row = await upsertPendingReminder({
    calendarEventId: ev.id,
    phone,
    guestName: ev.guestName,
    appointmentType: ev.appointmentType,
    startsAt: ev.startsAt,
  });
  return { row, phone };
}

/**
 * Daily 09:00 SGT: tomorrow day-before + today morning-of for guests who are
 * silent after the day-before or were never reached by one. A guest who
 * declined the invite, or whose event has left the calendar, is told it is
 * cancelled instead — the push (webhooks/google-calendar) normally got there
 * first; this is the net under it. Then renews that push channel.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await getSiteSettings([...APPOINTMENT_SETTING_KEYS]);
  const settings = parseAppointmentSettings(stored);

  // Admin kill switch (Settings → Appointments). Bail before touching Calendar
  // or Meta so a disabled run is cheap and leaves no reminder rows behind.
  if (!settings.whatsappEnabled) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      scanned: 0,
      reminded: 0,
      morning: 0,
      cancelled: 0,
      skipped: 0,
      errors: [],
    });
  }

  const now = new Date();

  const summary = {
    ok: true as const,
    scanned: 0,
    reminded: 0,
    morning: 0,
    cancelled: 0,
    skipped: 0,
    errors: [] as string[],
  };
  /** Events both passes saw on the calendar, so the sweep can skip them. */
  const seen = new Set<string>();

  // A declined invite leaves the event on the calendar; the guest is not coming.
  const cancelDeclined = async (row: ReminderRow) => {
    const outcome = await cancelAppointment(row, settings, { cause: "declined", now });
    if (outcome.kind === "cancelled") summary.cancelled += 1;
  };

  // --- Tomorrow: day-before ---
  let tomorrow;
  try {
    tomorrow = await listDayEvents(1, settings, now);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `calendar tomorrow: ${e instanceof Error ? e.message : "failed"}`,
      },
      { status: 500 },
    );
  }

  summary.scanned += tomorrow.length;

  for (const ev of tomorrow) {
    seen.add(ev.id);
    try {
      const prepared = await prepareRow(ev);
      if (prepared === "skipped") {
        summary.skipped += 1;
        continue;
      }
      const { row, phone } = prepared;
      if (ev.guestDeclined) {
        await cancelDeclined(row);
        continue;
      }

      // Reschedule reconciliation: a move made directly in Google Calendar runs
      // no app code, so a non-pending row is now stale. Compare by parsed ms (GCal
      // sends +08:00 offset, the row stores UTC Z — string compare would misfire).
      // On drift, re-arm to `pending` so the reminder/confirmation flow re-fires
      // for the NEW time (same flow as a fresh booking). Detection is bounded by
      // the daily cron: an event reconciles once it becomes "tomorrow"; real-time
      // move notices would need Google Calendar push channels, which we don't run.
      const movedMs = Date.parse(ev.startsAt);
      const rowMs = Date.parse(row.starts_at);
      const movedInGcal =
        Number.isFinite(movedMs) &&
        Number.isFinite(rowMs) &&
        Math.abs(movedMs - rowMs) > 60_000;

      // `rescheduled` is due a day-before too: the guest moved it over WhatsApp
      // to a later day, and nothing has reminded them of the new one.
      let from = row.status;
      if (!isDayBeforeEligible(from)) {
        // Already processed for this time, or over (cancelled, invalid phone).
        if (!movedInGcal || !LIVE_STATUSES.includes(from)) continue;
        const rearmed = await updateReminder(
          ev.id,
          { status: "pending", starts_at: ev.startsAt },
          from,
        );
        if (!rearmed) continue; // race: another worker re-armed/advanced it
        from = "pending";
      }

      // A failed send is recorded on the row, which stays `pending`, so the
      // guest still gets the morning-of tomorrow.
      const updated = await sendDayBeforeReminder(
        {
          calendarEventId: ev.id,
          phone,
          guestName: ev.guestName,
          startsAt: ev.startsAt,
          typeLabel: ev.typeLabel,
          from,
        },
        now,
      );
      if (!updated) {
        // Race: another worker won — treat as ok
        continue;
      }

      try {
        await syncGuestContact({ name: ev.guestName, phone, email: ev.email });
      } catch (ce) {
        summary.errors.push(
          `${ev.id}: contacts ${ce instanceof Error ? ce.message : "failed"}`,
        );
      }

      summary.reminded += 1;
    } catch (e) {
      summary.errors.push(
        `${ev.id}: ${e instanceof Error ? e.message : "day-before failed"}`,
      );
    }
  }

  // --- Today: morning-of for the silent and the never-reached ---
  let today;
  try {
    today = await listDayEvents(0, settings, now);
  } catch (e) {
    summary.errors.push(
      `calendar today: ${e instanceof Error ? e.message : "failed"}`,
    );
    return NextResponse.json(summary, { status: 200 });
  }

  summary.scanned += today.length;

  for (const ev of today) {
    seen.add(ev.id);
    try {
      let row = await getReminderByEventId(ev.id);
      if (!row) {
        // Booked straight in Google Calendar after yesterday's run, so no run
        // has seen it and it never had a day-before. Start its row now.
        const prepared = await prepareRow(ev);
        if (prepared === "skipped") {
          summary.skipped += 1;
          continue;
        }
        row = prepared.row;
      }
      if (ev.guestDeclined) {
        await cancelDeclined(row);
        continue;
      }
      if (!isMorningOfEligible(row.status)) continue;

      const phone = normalizePhone(row.phone) ?? normalizePhone(ev.phone);
      if (!phone || !isPhoneAllowed(phone)) {
        summary.skipped += 1;
        continue;
      }

      const sent = await sendMorningOfReminder(
        {
          calendarEventId: ev.id,
          phone,
          guestName: row.guest_name || ev.guestName,
          startsAt: ev.startsAt,
          venue: venueForEvent(ev.location, settings.venue),
          from: row.status,
        },
        now,
      );
      if (sent) summary.morning += 1;
    } catch (e) {
      summary.errors.push(
        `${ev.id}: ${e instanceof Error ? e.message : "morning-of failed"}`,
      );
    }
  }

  // --- Cancellation sweep: live rows whose event the passes did not see ---
  // Deleted events drop out of the day listings, and anything past tomorrow is
  // not listed at all, so ask Google about each remaining live row directly.
  try {
    const rows = (await listLiveUpcomingReminders(now, SWEEP_LIMIT)).filter(
      (r) => !seen.has(r.calendar_event_id),
    );
    const off: Array<{ row: ReminderRow; state: Exclude<EventState, "live"> }> = [];
    for (const row of rows) {
      try {
        const state = await getEventState(row.calendar_event_id);
        if (state !== "live") off.push({ row, state });
      } catch (e) {
        summary.errors.push(
          `${row.calendar_event_id}: sweep ${e instanceof Error ? e.message : "failed"}`,
        );
      }
    }
    // Most of the upcoming book gone at once reads like a different calendar
    // (GOOGLE_CALENDAR_ID changed), not a wave of cancellations. Telling every
    // one of those guests their visit is off cannot be taken back; stop.
    if (off.length >= 3 && off.length * 2 >= rows.length) {
      summary.errors.push(
        `sweep: ${off.length} of ${rows.length} upcoming events are off the calendar — not cancelling; check GOOGLE_CALENDAR_ID`,
      );
    } else {
      for (const { row, state } of off) {
        try {
          const outcome = await cancelAppointment(row, settings, {
            cause: state === "declined" ? "declined" : "removed",
            now,
          });
          if (outcome.kind === "cancelled") summary.cancelled += 1;
        } catch (e) {
          summary.errors.push(
            `${row.calendar_event_id}: cancel ${e instanceof Error ? e.message : "failed"}`,
          );
        }
      }
    }
  } catch (e) {
    summary.errors.push(`sweep: ${e instanceof Error ? e.message : "failed"}`);
  }

  // Keep the Calendar push channel open, so the next cancellation reaches the
  // guest when it happens rather than at this run.
  let watch: WatchResult | { status: "error"; detail: string };
  try {
    watch = await ensureCalendarWatch(now);
  } catch (e) {
    watch = { status: "error", detail: e instanceof Error ? e.message : "watch failed" };
    summary.errors.push(`calendar watch: ${watch.detail}`);
  }

  // Chain: Google Contacts sweep for every upcoming appointment (next 30 days) so
  // events staff add directly in Google Calendar get a contact too — Hobby stays at
  // 2 vercel.json crons. Manual ops / backfill: GET /api/cron/contacts-sync?days=N.
  let contacts:
    | Awaited<ReturnType<typeof sweepUpcomingContacts>>
    | { ok: false; error: string };
  try {
    contacts = await sweepUpcomingContacts(settings, { now });
  } catch (e) {
    contacts = { ok: false, error: e instanceof Error ? e.message : "contacts sweep failed" };
  }

  // Nothing keeps the JSON a cron returns; the log at least shows a failure for
  // the hour Hobby retains it. The row-level record is last_error.
  if (summary.errors.length) {
    console.error("[cron/appointment-reminders]", summary.errors.join(" | "));
  }

  return NextResponse.json({ ...summary, watch, contacts });
}

export async function POST(req: Request) {
  return GET(req);
}
