import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { rescheduleOwnBooking, type RescheduleRefusal } from "@/lib/appointments/reschedule";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RescheduleSchema = z.object({
  event_id: z.string().min(1).max(1024),
  start_iso: z.string().min(1).max(64),
  end_iso: z.string().min(1).max(64),
  location_id: z.string().min(1).max(64),
});

const REFUSED: Record<RescheduleRefusal, { status: number; error: string }> = {
  not_found: { status: 404, error: "We couldn't find that booking on your account." },
  closed: {
    status: 409,
    error: "Bookings can be changed until the day before the visit. Please message us on WhatsApp to change it now.",
  },
  not_bookable: { status: 400, error: "That time isn't a bookable slot. Please pick another." },
  location: { status: 409, error: "That location isn't taking bookings right now. Please pick another." },
  taken: { status: 409, error: "That time was just taken. Please pick another." },
};

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in to change a booking" }, { status: 401 });

  const parsed = RescheduleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const customer = await linkCustomerToAuthUser(user);
  const limited = await tooManyRequests(
    [{ bucket: "reschedule-customer", key: customer.id, windowMs: 60 * 60_000, max: 10 }],
    "Too many changes. Please wait a while, or message us on WhatsApp.",
  );
  if (limited) return limited;

  try {
    const out = await rescheduleOwnBooking(
      {
        eventId: parsed.data.event_id,
        startIso: parsed.data.start_iso,
        endIso: parsed.data.end_iso,
        locationId: parsed.data.location_id,
      },
      { customerId: customer.id, email: customer.email || user.email },
    );
    if (!out.ok) {
      const r = REFUSED[out.reason];
      return NextResponse.json({ error: r.error, code: out.reason }, { status: r.status });
    }
    return NextResponse.json({ ok: true, starts_at: out.startsAt, ends_at: out.endsAt, location_name: out.locationName });
  } catch (e) {
    console.error("[appointments/reschedule]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't change your booking. Please try again." }, { status: 502 });
  }
}
