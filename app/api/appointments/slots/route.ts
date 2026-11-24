import { NextResponse } from "next/server";
import { freeBusy } from "@/lib/appointments/calendar";
import { liveSlotHolds } from "@/lib/appointments/book-slot";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
  type AppointmentSettings,
} from "@/lib/appointments/settings";
import {
  addSgtDays,
  listDaySlots,
  monthOpenDays,
  sgtLocalToUtcMs,
  sgtParts,
  suggestNextDays,
  type SgtDay,
} from "@/lib/appointments/slots";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function busyFrom(from: SgtDay, days: number) {
  const end = addSgtDays(from.y, from.m, from.d, days);
  const fromIso = new Date(sgtLocalToUtcMs(from.y, from.m, from.d, 0, 0)).toISOString();
  const toIso = new Date(sgtLocalToUtcMs(end.y, end.m, end.d, 0, 0)).toISOString();
  const [busy, holds] = await Promise.all([freeBusy(fromIso, toIso), liveSlotHolds(fromIso, toIso)]);
  return [...busy, ...holds];
}

async function suggestions(settings: AppointmentSettings) {
  const now = new Date();
  const p = sgtParts(now.getTime());
  const busy = await busyFrom({ y: p.y, m: p.m, d: p.d }, settings.slotLookaheadDays + 1);
  return suggestNextDays(busy, settings, {}, now);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const month = searchParams.get("month");
  const dm = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const mm = !dm && month && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!dm && !mm) {
    return NextResponse.json({ error: "date=YYYY-MM-DD or month=YYYY-MM required" }, { status: 400 });
  }

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
    if (mm) {
      const m = { y: Number(mm[1]), m: Number(mm[2]) };
      const daysInMonth = new Date(Date.UTC(m.y, m.m, 0)).getUTCDate();
      const busy = await busyFrom({ ...m, d: 1 }, daysInMonth);
      return NextResponse.json({ ok: true, days: monthOpenDays(busy, settings, m) });
    }
    const day = { y: Number(dm![1]), m: Number(dm![2]), d: Number(dm![3]) };
    const slots = listDaySlots(await busyFrom(day, 1), settings, day);
    return NextResponse.json({
      ok: true,
      slots,
      suggestions: slots.length ? [] : await suggestions(settings).catch(() => []),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Slot lookup failed" },
      { status: 502 },
    );
  }
}
