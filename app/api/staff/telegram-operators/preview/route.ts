import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { sendReviewCardPreview } from "@/lib/reviews/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
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
