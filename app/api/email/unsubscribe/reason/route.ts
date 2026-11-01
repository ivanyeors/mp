import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { INVALID_LINK, NOT_CONFIGURED, unsubscribeConfigured, verifyUnsubscribeLink } from "@/lib/marketing-consent/unsubscribe";
import { UnsubscribeAnswerSchema, recordUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";

export const runtime = "nodejs";

/** An answer is a few hundred bytes; 500 characters of text is the most it carries. */
const MAX_BODY_BYTES = 4096;

const BodySchema = z.object({
  u: z.string().max(200),
  t: z.string().max(200),
  s: z.string().max(200).nullish(),
  reason: z.unknown(),
  text: z.unknown().optional(),
});

/**
 * *Mind telling us why?* on the unsubscribe page (PRD-crm-retention-loop slice
 * 11): one optional answer, after the unsubscribe has taken effect. It carries
 * the same signed link as the unsubscribe (`u`, `t`, and a campaign's `s`), so
 * only the person the email went to can answer, and it is recorded only while
 * they are unsubscribed, at most once per unsubscribe, never for a spam
 * complaint. It never changes consent: the unsubscribe route did that already.
 *
 * Answers `200 { ok: true, recorded }` (`recorded: false` when that unsubscribe
 * already has its answer), `409 { error: "not_unsubscribed" }` when there is
 * nothing to answer, `400` for a bad link or answer.
 */
export async function POST(req: Request) {
  if (!unsubscribeConfigured()) {
    return NextResponse.json({ ok: false, error: NOT_CONFIGURED }, { status: 503 });
  }
  // JSON only: a cross-site form can post text/plain without a preflight, not this.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "Send JSON" }, { status: 415 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
  }
  // One answer per unsubscribe; a handful an hour from one address is generous.
  if (await rateLimitExceeded({ bucket: "unsubscribe-reason", key: clientIp(req), windowMs: 60 * 60_000, max: 10 })) {
    return new NextResponse(null, { status: 429 });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Too large" }, { status: 413 });
    raw = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const body = BodySchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ ok: false, error: "Invalid answer" }, { status: 400 });
  const link = verifyUnsubscribeLink(body.data.u, body.data.t, body.data.s ?? null);
  if (!link) return NextResponse.json({ ok: false, error: INVALID_LINK }, { status: 400 });
  const answer = UnsubscribeAnswerSchema.safeParse({ reason: body.data.reason, text: body.data.text ?? undefined });
  if (!answer.success) return NextResponse.json({ ok: false, error: "Invalid answer" }, { status: 400 });

  try {
    const outcome = await recordUnsubscribeReason(supabaseAdmin(), link.customerId, answer.data);
    if (outcome === "recorded" || outcome === "already") {
      return NextResponse.json({ ok: true, recorded: outcome === "recorded" });
    }
    // Not unsubscribed now, a complaint, or nothing we ask about: nothing to answer.
    return NextResponse.json({ ok: false, error: "not_unsubscribed" }, { status: 409 });
  } catch (err) {
    console.error("[unsubscribe-reason] record failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Could not record the answer" }, { status: 500 });
  }
}
