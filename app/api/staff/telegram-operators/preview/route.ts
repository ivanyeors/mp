import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { sendReviewCardPreview } from "@/lib/reviews/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude drafts the sample replies (in parallel) before anything is sent.
export const maxDuration = 120;

/**
 * Staff Management → Telegram access → "Send preview": sample review cards to
 * the measurements group, so the team sees what real reviews will look like
 * and can tap a button to check their own access. Nothing is stored or posted
 * to Google. Owners/admins only (`staff`), like the rest of the tab.
 */
export async function POST() {
  let ctx;
  try {
    ctx = await requireAdminContext("staff");
  } catch (res) {
    return res as NextResponse;
  }

  const result = await sendReviewCardPreview();
  await recordAdminAction({
    actor: ctx,
    action: "telegram_operator.preview",
    entityType: "telegram_operator",
    after: result,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
