import { NextResponse } from "next/server";
import { freeBusy } from "@/lib/appointments/calendar";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { addSgtDays, listDaySlots, sgtLocalToUtcMs } from "@/lib/appointments/slots";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/appointments/slots?date=YYYY-MM-DD → free slots for that SGT day. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const m = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  }
  const day = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const next = addSgtDays(day.y, day.m, day.d, 1);
  const timeMin = new Date(sgtLocalToUtcMs(day.y, day.m, day.d, 0, 0)).toISOString();
  const timeMax = new Date(sgtLocalToUtcMs(next.y, next.m, next.d, 0, 0)).toISOString();

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...APPOINTMENT_SETTING_KEYS]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key] = row.value;
  const settings = parseAppointmentSettings(stored);

  try {
    const busy = await freeBusy(timeMin, timeMax);
    const slots = listDaySlots(busy, settings, day);
    return NextResponse.json({ ok: true, slots });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Slot lookup failed" },
      { status: 502 },
    );
  }
}
