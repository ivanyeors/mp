import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { getGoogleReviewsStatus } from "@/lib/reviews/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users & permissions → Telegram: how Google reviews reach the group. Needs the `users` permission. */
export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }
  return NextResponse.json(await getGoogleReviewsStatus());
}
