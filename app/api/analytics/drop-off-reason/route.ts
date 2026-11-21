import { NextResponse } from "next/server";
import { dropOffStepForPath } from "@/lib/analytics/drop-off/reasons";
import { SiteDropOffAnswerSchema } from "@/lib/analytics/drop-off/schema";
import { recordDropOffReason } from "@/lib/analytics/drop-off/store";
import { normalizeJourneyPath } from "@/lib/analytics/journey/paths";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }
  if (await rateLimitExceeded({ bucket: "drop-off-reason", key: clientIp(req), windowMs: 60 * 60_000, max: 6 })) {
    return new NextResponse(null, { status: 429 });
  }
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
    raw = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SiteDropOffAnswerSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  const answer = parsed.data;

  const path = normalizeJourneyPath(answer.path);
  if (path === null || dropOffStepForPath(path) !== answer.step) {
    return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  }

  try {
    const outcome = await recordDropOffReason(supabaseAdmin(), {
      step: answer.step,
      reason: answer.reason,
      other_text: answer.text,
      path,
      visit_id: answer.visitId ?? null,
      visitor_id: answer.visitorId ?? null,
      result_id: null,
    });
    return NextResponse.json({ ok: true, duplicate: outcome === "duplicate" });
  } catch {
    return NextResponse.json({ error: "Could not record the answer" }, { status: 500 });
  }
}
