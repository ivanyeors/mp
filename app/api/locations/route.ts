import { NextResponse } from "next/server";
import { readBookingLocations } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/locations (public) → bookable locations (with an address) for the booking picker. */
export async function GET() {
  return NextResponse.json({ ok: true, locations: await readBookingLocations() });
}
