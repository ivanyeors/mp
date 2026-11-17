import { NextResponse, type NextRequest } from "next/server";
import { coarse, rainingInSingapore, RAINFALL_URL } from "@/lib/explore/weather";

/**
 * GET /api/explore/weather: what the Explore page's sky needs to know about
 * where the visitor is. `raining` is true only in Singapore, from NEA's rain
 * gauges (lib/explore/weather.ts); `place` is the visitor's rough position as
 * the host worked it out from their connection, rounded to about 11 km, for
 * putting the sun where theirs is. Nothing is stored, and nothing about the
 * visitor is sent to the weather service: the same public reading serves
 * everyone, fetched at most once every five minutes.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.headers.get("x-vercel-ip-latitude"));
  const lon = Number(req.headers.get("x-vercel-ip-longitude"));
  const known = req.headers.has("x-vercel-ip-latitude") && Number.isFinite(lat) && Number.isFinite(lon);
  const place = known ? { lat: coarse(lat), lon: coarse(lon) } : null;
  const country = (req.headers.get("x-vercel-ip-country") ?? "").toUpperCase();

  let raining = false;
  if (country === "SG") {
    try {
      const res = await fetch(RAINFALL_URL, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
      if (res.ok) raining = rainingInSingapore(await res.json(), place);
    } catch {
      // No reading: a dry sky.
    }
  }
  return NextResponse.json({ raining, place }, { headers: { "Cache-Control": "private, max-age=300" } });
}
