import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { getAdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
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
  return secretMatches(`Bearer ${secret}`, req.headers.get("authorization"));
}

async function authorize(req: Request): Promise<boolean> {
  if (authorizeCron(req)) return true;
  const ctx = await getAdminContext();
  return ctx != null && hasPermission(ctx, "results");
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
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
