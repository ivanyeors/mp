import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { bookCalendarSlot, isSlotFree } from "@/lib/appointments/book-slot";
import { LANGUAGE_PREFERENCES, languagePreferenceNotes } from "@/lib/appointments/language";
import { normalizePhone } from "@/lib/appointments/phone";
import { isOfferableSlot } from "@/lib/appointments/slots";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { getLocation } from "@/lib/locations";
import { recordBoxConsentByEmail } from "@/lib/marketing-consent/consent";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";
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
  language_preference: z.enum(LANGUAGE_PREFERENCES).default("none"),
  /**
   * The marketing email box, ticked by default (ADR 0037; PRD-campaign-audiences
   * slice 02). Absent, as from a booking tab opened before it, is unticked.
   */
  marketing_email: z.boolean().optional(),
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

  // A re-adjustment is booked against one purchase by a signed-in Customer and
  // may be charged (ADR 0024) — never anonymously through this route.
  if (parsed.appointment_type === "readjustment") {
    return NextResponse.json(
      { error: "Sign in to book a re-adjustment", code: "readjustment_requires_sign_in" },
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

  // Each booking sends a calendar invite and a paid WhatsApp template to the
  // address and number given, so cap the recipient as well as the caller.
  const limited = await tooManyRequests(
    [
      { bucket: "booking-ip", key: clientIp(req), windowMs: 60 * 60_000, max: 10 },
      { bucket: "booking-email", key: parsed.email.trim().toLowerCase(), windowMs: 24 * 60 * 60_000, max: 3 },
      { bucket: "booking-phone", key: phone, windowMs: 24 * 60 * 60_000, max: 3 },
    ],
    "Too many bookings. Please contact us if you need another appointment.",
  );
  if (limited) return limited;

  const location = await getLocation(parsed.location_id);
  if (!location) return NextResponse.json({ error: "Unknown location" }, { status: 404 });
  if (!location.address) {
    return NextResponse.json({ error: "Location has no address" }, { status: 400 });
  }
  // A stale deep link / open tab can still submit a location staff switched off.
  if (!location.bookable) {
    return NextResponse.json(
      { error: "This location is not taking bookings right now" },
      { status: 409 },
    );
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
  // Only a time the slot picker offers: one appointment long, on the grid, in
  // the future. Without it one request could block the calendar for a month.
  if (!isOfferableSlot(parsed.start_iso, parsed.end_iso, settings)) {
    return NextResponse.json({ error: "That time is not a bookable slot" }, { status: 400 });
  }

  try {
    // ponytail: last-writer-wins re-check — no per-slot lock. Two submits racing
    // the same free slot can both pass freeBusy and double-book; acceptable for
    // low booking volume. Add a per-slot advisory lock if contention shows up.
    // A re-adjustment slot a customer is paying for (ADR 0024) counts as taken.
    if (!(await isSlotFree(parsed.start_iso, parsed.end_iso))) {
      return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
    }

    const { eventId, contact } = await bookCalendarSlot({
      startIso: parsed.start_iso,
      endIso: parsed.end_iso,
      location: { id: location.id, address: location.address },
      guestName: parsed.guest_name,
      phone,
      email: parsed.email,
      appointmentType: parsed.appointment_type,
      settings,
      notes: languagePreferenceNotes(parsed.language_preference),
    });

    // The marketing email box (ADR 0037), once the visit is on the calendar:
    // finds or creates the Customer by the email given. Subscribes someone
    // nobody has asked, never one who unsubscribed; never stops the booking.
    await recordBoxConsentByEmail(admin, parsed.email, parsed.marketing_email === true, "appointment");

    return NextResponse.json({ ok: true, eventId, contact });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Booking failed" },
      { status: 502 },
    );
  }
}
