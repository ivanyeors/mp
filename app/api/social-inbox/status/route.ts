import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { getSocialInboxStatus } from "@/lib/social-inbox/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users & permissions → Telegram: which platforms are connected. Needs the `users` permission. */
export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }
  return NextResponse.json(await getSocialInboxStatus());
}
