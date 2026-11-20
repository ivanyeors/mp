import { NextResponse, type NextRequest } from "next/server";
import { coarse, rainingInSingapore, RAINFALL_URL } from "@/lib/explore/weather";

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
    } catch {}
  }
  return NextResponse.json({ raining, place }, { headers: { "Cache-Control": "private, max-age=300" } });
}
