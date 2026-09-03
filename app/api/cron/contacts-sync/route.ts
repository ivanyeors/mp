import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import {
  DEFAULT_CONTACT_SWEEP_DAYS,
  sweepUpcomingContacts,
} from "@/lib/appointments/contacts-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/**
 * Google Contacts sweep for upcoming appointments (default next 30 days, `?days=N`
 * up to 100 for a backfill). Chained daily from /api/cron/appointment-reminders —
 * Hobby stays at 2 vercel.json crons; this route is for manual ops / backfills.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const daysRaw = Number(searchParams.get("days") ?? DEFAULT_CONTACT_SWEEP_DAYS);
  const days = Number.isFinite(daysRaw) ? daysRaw : DEFAULT_CONTACT_SWEEP_DAYS;

  const stored = await getSiteSettings([...APPOINTMENT_SETTING_KEYS]);
  const settings = parseAppointmentSettings(stored);

  try {
    const summary = await sweepUpcomingContacts(settings, { days });
    return NextResponse.json({ ok: true, days, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "contacts sweep failed" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
