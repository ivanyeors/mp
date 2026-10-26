import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { productionMetaWebhookUrl } from "@/lib/social-inbox/meta";
import { getSocialInboxStatus } from "@/lib/social-inbox/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users & permissions → Telegram: which platforms are connected. Needs the `users` permission. */
export async function GET(req: Request) {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }
  return NextResponse.json(await getSocialInboxStatus(productionMetaWebhookUrl(req)));
}
