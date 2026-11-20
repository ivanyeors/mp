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

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await getSiteSettings([...APPOINTMENT_SETTING_KEYS]);
  const settings = parseAppointmentSettings(stored);

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
  const seen = new Set<string>();

  const cancelDeclined = async (row: ReminderRow) => {
    const outcome = await cancelAppointment(row, settings, { cause: "declined", now });
    if (outcome.kind === "cancelled") summary.cancelled += 1;
  };

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

      const movedMs = Date.parse(ev.startsAt);
      const rowMs = Date.parse(row.starts_at);
      const movedInGcal =
        Number.isFinite(movedMs) &&
        Number.isFinite(rowMs) &&
        Math.abs(movedMs - rowMs) > 60_000;

      let from = row.status;
      if (!isDayBeforeEligible(from)) {
        if (!movedInGcal || !LIVE_STATUSES.includes(from)) continue;
        const rearmed = await updateReminder(
          ev.id,
          { status: "pending", starts_at: ev.startsAt },
          from,
        );
        if (!rearmed) continue;
        from = "pending";
      }

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

  let watch: WatchResult | { status: "error"; detail: string };
  try {
    watch = await ensureCalendarWatch(now);
  } catch (e) {
    watch = { status: "error", detail: e instanceof Error ? e.message : "watch failed" };
    summary.errors.push(`calendar watch: ${watch.detail}`);
  }

  let contacts:
    | Awaited<ReturnType<typeof sweepUpcomingContacts>>
    | { ok: false; error: string };
  try {
    contacts = await sweepUpcomingContacts(settings, { now });
  } catch (e) {
    contacts = { ok: false, error: e instanceof Error ? e.message : "contacts sweep failed" };
  }

  if (summary.errors.length) {
    console.error("[cron/appointment-reminders]", summary.errors.join(" | "));
  }

  return NextResponse.json({ ...summary, watch, contacts });
}

export async function POST(req: Request) {
  return GET(req);
}
