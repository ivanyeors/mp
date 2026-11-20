import { NextResponse } from "next/server";
import { tooManyRequests } from "@/lib/rate-limit";

import { bookCalendarSlot, isSlotFree } from "@/lib/appointments/book-slot";
import { languagePreferenceNotes } from "@/lib/appointments/language";
import { recordBoxConsent } from "@/lib/marketing-consent/consent";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { isFreeVisit } from "@/lib/readjustment/eligibility";
import {
  ReadjustmentBookingSchema,
  bookingNotes,
  checkSlotRequest,
  purchaseColumns,
  resolveBookingTarget,
  resolveSignedInCustomer,
} from "@/lib/readjustment/request";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const customer = await resolveSignedInCustomer().catch(() => null);
  if (!customer) {
    return NextResponse.json({ error: "Sign in to book a re-adjustment" }, { status: 401 });
  }
  const limited = await tooManyRequests([
    { bucket: "readjustment-customer", key: customer.id, windowMs: 60 * 60_000, max: 10 },
  ]);
  if (limited) return limited;

  const parsed = ReadjustmentBookingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const body = parsed.data;

  const checked = await checkSlotRequest(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const { slot } = checked;

  const admin = supabaseAdmin();
  const resolved = await resolveBookingTarget(admin, customer.id, body);
  if (!resolved) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  const { target } = resolved;
  const { quote } = target;
  if (!isFreeVisit(quote)) {
    return NextResponse.json(
      { error: "This visit isn't complimentary", code: "not_complimentary", quote },
      { status: 409 },
    );
  }
  const seq = quote.complimentary ? quote.seq : null;
  const recordConsent = () => recordBoxConsent(admin, customer.id, body.marketing_email === true, "appointment");

  try {
    if (!(await isSlotFree(slot.startIso, slot.endIso))) {
      return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
    }
    const settings = await getAppointmentSettings();

    const { data: booking, error: insErr } = await admin
      .from("readjustment_bookings")
      .insert({
        customer_id: customer.id,
        ...purchaseColumns(target),
        complimentary: quote.complimentary,
        complimentary_seq: seq,
        fee_amount: 0,
        location_id: slot.location.id,
        location_name: slot.location.name,
        start_at: slot.startIso,
        end_at: slot.endIso,
        guest_name: body.guest_name,
        phone: slot.phone,
        email: customer.email,
        status: "booked",
      })
      .select("id")
      .single();
    if (insErr || !booking) {
      if (insErr?.code === "23505") {
        return NextResponse.json(
          { error: "That free visit was just booked. Refresh to see your price.", code: "free_visit_taken" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: insErr?.message ?? "Booking failed" }, { status: 500 });
    }

    let eventId = null as string | null;
    try {
      await bookCalendarSlot({
        startIso: slot.startIso,
        endIso: slot.endIso,
        location: slot.location,
        guestName: body.guest_name,
        phone: slot.phone,
        email: customer.email,
        appointmentType: "readjustment",
        settings,
        notes: [
          ...bookingNotes(target, quote.complimentary ? { kind: "complimentary" } : { kind: "no_fee" }),
          ...languagePreferenceNotes(body.language_preference),
        ],
        readjustmentBookingId: booking.id,
        onEventCreated: async (id) => {
          eventId = id;
          const { error } = await admin
            .from("readjustment_bookings")
            .update({ calendar_event_id: id, updated_at: new Date().toISOString() })
            .eq("id", booking.id);
          if (error) throw new Error(error.message);
        },
      });
    } catch (e) {
      if (eventId) {
        console.error(
          `[readjustments/book] ${booking.id} booked as ${eventId}, but a follow-up step failed:`,
          e instanceof Error ? e.message : e,
        );
        await recordConsent();
        return NextResponse.json({ ok: true, bookingId: booking.id, eventId });
      }
      await admin
        .from("readjustment_bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", booking.id);
      throw e;
    }

    await recordConsent();
    return NextResponse.json({ ok: true, bookingId: booking.id, eventId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Booking failed" }, { status: 502 });
  }
}
