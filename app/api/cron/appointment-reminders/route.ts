import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { getSiteSettings } from "@/lib/site-settings";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { isPhoneAllowed, normalizePhone } from "@/lib/appointments/phone";
import {
  listDayEvents,
  venueForEvent,
  type CalendarGuestEvent,
} from "@/lib/appointments/calendar";
import { syncGuestContact } from "@/lib/appointments/contacts";
import { sweepUpcomingContacts } from "@/lib/appointments/contacts-sweep";
import { sendDayBeforeReminder, sendMorningOfReminder } from "@/lib/appointments/remind";
import { isMorningOfEligible } from "@/lib/appointments/state";
import {
  getReminderByEventId,
  updateReminder,
  upsertPendingReminder,
  type ReminderRow,
} from "@/lib/appointments/reminders-db";

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
 * silent after the day-before or were never reached by one.
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
    skipped: 0,
    errors: [] as string[],
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
    try {
      const prepared = await prepareRow(ev);
      if (prepared === "skipped") {
        summary.skipped += 1;
        continue;
      }
      const { row, phone } = prepared;

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

      if (row.status !== "pending") {
        if (!movedInGcal) continue; // already processed for this time
        const rearmed = await updateReminder(
          ev.id,
          { status: "pending", starts_at: ev.startsAt },
          row.status,
        );
        if (!rearmed) continue; // race: another worker re-armed/advanced it
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

  return NextResponse.json({ ...summary, contacts });
}

export async function POST(req: Request) {
  return GET(req);
}
