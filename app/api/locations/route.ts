import { NextResponse } from "next/server";
import { getLocations, selectBookableLocations } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/locations (public) → bookable locations (with an address) for the booking picker. */
export async function GET() {
  const locations = selectBookableLocations(await getLocations()).map(
    ({ id, name, type, address }) => ({ id, name, type, address }),
  );
  return NextResponse.json({ ok: true, locations });
}
