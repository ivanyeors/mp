import { NextResponse } from "next/server";
import { resolveCountryFromHeaders } from "@/lib/analytics/journey/country";
import { VISITOR_COOKIE, readVisitorCookie } from "@/lib/analytics/journey/identity";
import { entryAppFromUserAgent } from "@/lib/analytics/journey/in-app";
import { parseIngestBody, persistJourneyIngest } from "@/lib/analytics/journey/ingest";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function POST(req: Request) {
  if (isRateLimited({ bucket: "analytics-ingest", key: clientIp(req), windowMs: 60_000, max: 120 })) {
    return new NextResponse(null, { status: 429 });
  }
  let raw: unknown;
  try {
    const text = await req.text();
    raw = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseIngestBody(raw);
  if (!parsed.ok) {
    const status = parsed.error === "admin path rejected" ? 204 : 400;
    if (status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ error: parsed.error }, { status });
  }

  const country = resolveCountryFromHeaders(req.headers);
  const result = await persistJourneyIngest(supabaseAdmin(), {
    ...parsed.body,
    country,
    entryApp: entryAppFromUserAgent(req.headers.get("user-agent")),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  const held = readVisitorCookie(req);
  if (held === parsed.body.visitorId) {
    res.cookies.set(VISITOR_COOKIE, held, {
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
