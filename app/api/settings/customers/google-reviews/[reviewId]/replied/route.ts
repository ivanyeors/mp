import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { markReviewRepliedByStaff } from "@/lib/reviews/admin-reply";
import { MAX_REPLY_CHARS } from "@/lib/reviews/reply-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Schema = z.object({ reply: z.string().trim().min(1).max(MAX_REPLY_CHARS) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reviewId } = await params;
  if (!UUID.test(reviewId)) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the reply you posted." }, { status: 400 });

  let result;
  try {
    const me = await actingProfile(ctx.memberId);
    result = await markReviewRepliedByStaff(reviewId, parsed.data.reply, me?.name ?? "Staff");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not mark it replied" }, { status: 500 });
  }
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "invalid" ? 400 : 409;
    return NextResponse.json({ error: result.message }, { status });
  }

  await recordAdminAction({
    actor: ctx,
    action: "google_review.mark_replied",
    entityType: "google_review",
    entityId: reviewId,
    after: { status: result.row.status },
  });
  return NextResponse.json({ ok: true });
}
