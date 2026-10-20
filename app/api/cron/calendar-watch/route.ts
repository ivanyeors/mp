import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { getAdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { ensureCalendarWatch } from "@/lib/appointments/calendar-watch";

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

/** Cron secret (curl) or a signed-in staff session (open it in the browser). */
async function authorize(req: Request): Promise<boolean> {
  if (authorizeCron(req)) return true;
  const ctx = await getAdminContext();
  return ctx != null && hasPermission(ctx, "appointments");
}

/**
 * Open (or renew) the Google Calendar push channel that delivers cancellations
 * as they happen. Chained daily from /api/cron/appointment-reminders — Hobby
 * stays at 2 vercel.json crons; this route is for opening it right after a
 * deploy instead of waiting for the next 09:00 run, and for checking on it.
 */
export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, watch: await ensureCalendarWatch() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "watch failed" },
      { status: 502 },
    );
  }
}
