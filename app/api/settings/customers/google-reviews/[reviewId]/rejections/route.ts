import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rejectGoogleReviewMatch } from "@/lib/crm/google-review-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Any UUID shape, as the other Customers routes accept. */
const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const RejectSchema = z.object({ customerId: UUID }).strict();

/**
 * POST /api/settings/customers/google-reviews/[reviewId]/rejections — `{
 * customerId }`: *Not them* on a suggestion. That Customer is never suggested
 * for this review again. Needs `customers-edit`. A linked pair is refused
 * with 409: unlink it instead, which records the same.
 */
export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reviewId } = await params;
  if (!UUID.safeParse(reviewId).success) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  const parsed = RejectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say which customer it is not." }, { status: 400 });

  let result;
  try {
    const me = await actingProfile(ctx.memberId);
    result = await rejectGoogleReviewMatch(supabaseAdmin(), { reviewId, ...parsed.data, profileId: me?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save that" }, { status: 500 });
  }
  if (result === "not_found") {
    return NextResponse.json({ error: "That review or customer no longer exists." }, { status: 404 });
  }
  if (result === "linked") {
    return NextResponse.json({ error: "This review is linked to that customer. Unlink it instead." }, { status: 409 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "customer_google_review.reject",
    entityType: "google_review",
    entityId: reviewId,
    after: { customer_id: parsed.data.customerId },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
