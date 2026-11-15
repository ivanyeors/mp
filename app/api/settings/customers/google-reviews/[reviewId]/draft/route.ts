import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { redraftReviewReply } from "@/lib/reviews/admin-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One Claude call; the same room the review sync gives a draft.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/settings/customers/google-reviews/[reviewId]/draft — a fresh
 * suggested reply for the Reviews tab (PRD-customer-page-journey slice 03).
 * Needs `customers-edit`. Nothing is posted to Google: the reply is copied by
 * hand. Answers `{ ok, reply, saved }`; `saved` is true when the review was
 * still waiting and the draft now shows on its Telegram card too.
 *
 * The Audit Log names the review, never its text or the draft.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reviewId } = await params;
  if (!UUID.test(reviewId)) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  let result;
  try {
    result = await redraftReviewReply(reviewId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not draft a reply" }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.reason === "not_found" ? 404 : 502 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "google_review.redraft",
    entityType: "google_review",
    entityId: reviewId,
    after: { saved: result.saved },
  });
  return NextResponse.json({ ok: true, reply: result.reply, saved: result.saved });
}
