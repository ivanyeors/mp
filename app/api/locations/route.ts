import { NextResponse } from "next/server";
import { getLocations } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/locations (public) → visible locations for the booking picker. */
export async function GET() {
  const locations = (await getLocations())
    .filter((l) => l.visible)
    .map(({ id, name, type, address }) => ({ id, name, type, address }));
  return NextResponse.json({ ok: true, locations });
}
