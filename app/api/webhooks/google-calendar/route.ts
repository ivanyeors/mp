import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { listChangedEventStates } from "@/lib/appointments/calendar";
import { verifyCalendarChannel } from "@/lib/appointments/calendar-watch";
import { cancelFromCalendar } from "@/lib/appointments/cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const ok = await verifyCalendarChannel(
    req.headers.get("x-goog-channel-id"),
    req.headers.get("x-goog-channel-token"),
  );
  if (!ok) return NextResponse.json({ error: "Unknown channel" }, { status: 401 });

  if (req.headers.get("x-goog-resource-state") === "sync") {
    return NextResponse.json({ ok: true });
  }

  const settings = parseAppointmentSettings(
    await getSiteSettings([...APPOINTMENT_SETTING_KEYS]),
  );
  if (!settings.whatsappEnabled) return NextResponse.json({ ok: true, disabled: true });

  const now = new Date();
  const changed = await listChangedEventStates(
    new Date(now.getTime() - LOOKBACK_MS).toISOString(),
  );

  let cancelled = 0;
  for (const ev of changed) {
    try {
      const outcome = await cancelFromCalendar(ev.id, ev.state, settings, now);
      if (outcome?.kind === "cancelled") cancelled += 1;
    } catch (e) {
      console.error("[webhooks/google-calendar]", ev.id, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true, changed: changed.length, cancelled });
}
