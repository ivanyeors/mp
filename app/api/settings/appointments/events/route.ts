import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { listRangeEvents } from "@/lib/appointments/calendar";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");
  if (!timeMin || !timeMax) {
    return NextResponse.json(
      { error: "timeMin and timeMax query params required" },
      { status: 400 },
    );
  }
  const minMs = Date.parse(timeMin);
  const maxMs = Date.parse(timeMax);
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs >= maxMs) {
    return NextResponse.json({ error: "Invalid timeMin or timeMax" }, { status: 400 });
  }
  // Cap range so a bad client can't pull an unbounded GCal dump
  if (maxMs - minMs > 100 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Range too large (max 100 days)" }, { status: 400 });
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
    const events = await listRangeEvents(timeMin, timeMax, settings);
    return NextResponse.json({ ok: true, events });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calendar fetch failed" },
      { status: 502 },
    );
  }
}
