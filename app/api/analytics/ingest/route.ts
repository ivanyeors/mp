import { NextResponse } from "next/server";
import { resolveCountryFromHeaders } from "@/lib/analytics/journey/country";
import { parseIngestBody, persistJourneyIngest } from "@/lib/analytics/journey/ingest";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** First-party journey beacon ingest. Always collects; Admin paths rejected. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    // sendBeacon often delivers text/plain; accept JSON text either way
    const text = await req.text();
    raw = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseIngestBody(raw);
  if (!parsed.ok) {
    const status = parsed.error === "admin path rejected" ? 204 : 400;
    // 204: swallow admin beacons quietly (tracker should not send, but if it does)
    if (status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ error: parsed.error }, { status });
  }

  // Server-side geo headers only — ignore client body for country.
  const country = resolveCountryFromHeaders(req.headers);
  const result = await persistJourneyIngest(supabaseAdmin(), {
    ...parsed.body,
    country,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
