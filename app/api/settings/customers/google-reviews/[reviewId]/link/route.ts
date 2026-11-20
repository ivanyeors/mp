import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import { linkGoogleReview, unlinkGoogleReview } from "@/lib/crm/google-review-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const LinkSchema = z.object({ customerId: UUID, how: z.enum(["suggestion", "manual"]) }).strict();
const UnlinkSchema = z.object({ customerId: UUID }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reviewId } = await params;
  if (!UUID.safeParse(reviewId).success) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  const parsed = LinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a customer to link." }, { status: 400 });

  let result;
  try {
    const me = await actingProfile(ctx.memberId);
    result = await linkGoogleReview(supabaseAdmin(), { reviewId, ...parsed.data, profileId: me?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not link the review" }, { status: 500 });
  }
  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: "That review or customer no longer exists." }, { status: 404 });
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: "This review is already linked to a customer. Unlink it there first.", current: result.current },
      { status: 409 },
    );
  }

  await recordAdminAction({
    actor: ctx,
    action: "customer_google_review.link",
    entityType: "google_review",
    entityId: reviewId,
    after: { customer_id: result.link.customerId, how: result.link.how },
  });
  return NextResponse.json({ ok: true, link: result.link }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reviewId } = await params;
  if (!UUID.safeParse(reviewId).success) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  const parsed = UnlinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say which customer to unlink." }, { status: 400 });

  let unlinked: boolean;
  try {
    const me = await actingProfile(ctx.memberId);
    unlinked = await unlinkGoogleReview(supabaseAdmin(), { reviewId, ...parsed.data, profileId: me?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not unlink the review" }, { status: 500 });
  }
  if (!unlinked) return NextResponse.json({ error: "That review is not linked to this customer." }, { status: 404 });

  await recordAdminAction({
    actor: ctx,
    action: "customer_google_review.unlink",
    entityType: "google_review",
    entityId: reviewId,
    before: { customer_id: parsed.data.customerId },
  });
  return NextResponse.json({ ok: true });
}
