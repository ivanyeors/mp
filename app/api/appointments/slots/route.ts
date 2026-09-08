import { NextResponse } from "next/server";
import { freeBusy } from "@/lib/appointments/calendar";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
  type AppointmentSettings,
} from "@/lib/appointments/settings";
import {
  addSgtDays,
  listDaySlots,
  sgtLocalToUtcMs,
  sgtParts,
  suggestNextDays,
  type SgtDay,
} from "@/lib/appointments/slots";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** freeBusy over `days` SGT days starting at `from`. */
function busyFrom(from: SgtDay, days: number) {
  const end = addSgtDays(from.y, from.m, from.d, days);
  return freeBusy(
    new Date(sgtLocalToUtcMs(from.y, from.m, from.d, 0, 0)).toISOString(),
    new Date(sgtLocalToUtcMs(end.y, end.m, end.d, 0, 0)).toISOString(),
  );
}

/**
 * The earliest days with room, scanned from today so a full pick never points
 * past the booking horizon. Costs a second freeBusy call, paid only on the
 * rare empty day rather than on every date the guest taps.
 */
async function suggestions(settings: AppointmentSettings) {
  // One clock read feeds both the freeBusy window and the scan, so they cannot
  // disagree about which day "today" is across a midnight rollover.
  const now = new Date();
  const p = sgtParts(now.getTime());
  const busy = await busyFrom({ y: p.y, m: p.m, d: p.d }, settings.slotLookaheadDays + 1);
  return suggestNextDays(busy, settings, {}, now);
}

/**
 * GET /api/appointments/slots?date=YYYY-MM-DD → free slots for that SGT day,
 * plus `suggestions` (the earliest days with room) when that day has none.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const m = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  }
  const day = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };

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
    const slots = listDaySlots(await busyFrom(day, 1), settings, day);
    return NextResponse.json({
      ok: true,
      slots,
      // Best-effort: a failed suggestion lookup must not sink a valid answer.
      suggestions: slots.length ? [] : await suggestions(settings).catch(() => []),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Slot lookup failed" },
      { status: 502 },
    );
  }
}
