import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { getSocialInboxStatus } from "@/lib/social-inbox/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → Staff Management → Telegram access: which platforms are connected. Owners/admins only. */
export async function GET() {
  try {
    await requireAdminContext("staff");
  } catch (res) {
    return res as NextResponse;
  }
  return NextResponse.json(await getSocialInboxStatus());
}
