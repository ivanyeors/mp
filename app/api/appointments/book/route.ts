import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createEvent, freeBusy } from "@/lib/appointments/calendar";
import { normalizePhone } from "@/lib/appointments/phone";
import { upsertPendingReminder } from "@/lib/appointments/reminders-db";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { getLocation } from "@/lib/locations";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BookSchema = z.object({
  location_id: z.string().min(1),
  start_iso: z.string().min(1),
  end_iso: z.string().min(1),
  guest_name: z.string().min(1).max(200),
  phone: z.string().min(1),
  email: z.string().email(),
  appointment_type: z.enum(["customisation", "readjustment"]).default("customisation"),
});

/** POST /api/appointments/book → create GCal event + pending reminder row. */
export async function POST(req: Request) {
  let parsed: z.infer<typeof BookSchema>;
  try {
    parsed = BookSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const startMs = Date.parse(parsed.start_iso);
  const endMs = Date.parse(parsed.end_iso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return NextResponse.json({ error: "Invalid start_iso/end_iso" }, { status: 400 });
  }
  const phone = normalizePhone(parsed.phone);
  if (!phone) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

  const location = await getLocation(parsed.location_id);
  if (!location) return NextResponse.json({ error: "Unknown location" }, { status: 404 });
  if (!location.address) {
    return NextResponse.json({ error: "Location has no address" }, { status: 400 });
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

  const typeLabel =
    parsed.appointment_type === "readjustment"
      ? settings.readjustmentSummaryMatch
      : settings.customisationSummaryMatch;
  const summary = `${parsed.guest_name} - ${typeLabel}`;

  try {
    // ponytail: last-writer-wins re-check — no per-slot lock. Two submits racing
    // the same free slot can both pass freeBusy and double-book; acceptable for
    // low booking volume. Add a per-slot advisory lock if contention shows up.
    const busy = await freeBusy(parsed.start_iso, parsed.end_iso);
    const taken = busy.some((b) => startMs < b.endMs && endMs > b.startMs);
    if (taken) {
      return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
    }

    const eventId = await createEvent({
      startIso: parsed.start_iso,
      endIso: parsed.end_iso,
      summary,
      locationAddress: location.address,
      guestName: parsed.guest_name,
      phone,
      email: parsed.email,
    });

    await upsertPendingReminder({
      calendarEventId: eventId,
      phone,
      guestName: parsed.guest_name,
      appointmentType: parsed.appointment_type,
      startsAt: new Date(startMs).toISOString(),
    });

    return NextResponse.json({ ok: true, eventId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Booking failed" },
      { status: 502 },
    );
  }
}
