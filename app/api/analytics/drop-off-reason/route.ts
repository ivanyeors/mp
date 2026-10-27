import { NextResponse } from "next/server";
import { dropOffStepForPath } from "@/lib/analytics/drop-off/reasons";
import { SiteDropOffAnswerSchema } from "@/lib/analytics/drop-off/schema";
import { recordDropOffReason } from "@/lib/analytics/drop-off/store";
import { normalizeJourneyPath } from "@/lib/analytics/journey/paths";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * One answer from the storefront's *What stopped you today?* card
 * (PRD-crm-retention-loop slice 10). Anonymous: the journey tracker's Visit
 * and Visitor ids, the page, the step, the answer and any text typed. A
 * second answer for the same Visit and step is already recorded, not an
 * error. Decline answers come through the decline route, never here.
 */
export async function POST(req: Request) {
  // A person answers once a month; ten a minute from one address is a script.
  if (isRateLimited({ bucket: "drop-off-reason", key: clientIp(req), windowMs: 60_000, max: 10 })) {
    return new NextResponse(null, { status: 429 });
  }
  let raw: unknown;
  try {
    // sendBeacon delivers text/plain; accept JSON text either way.
    raw = JSON.parse(await req.text()) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SiteDropOffAnswerSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  const answer = parsed.data;

  // The card asks only where its step lives; an Admin Panel path normalises to null.
  const path = answer.path ? normalizeJourneyPath(answer.path) : null;
  if (answer.path && (path === null || dropOffStepForPath(path) !== answer.step)) {
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
