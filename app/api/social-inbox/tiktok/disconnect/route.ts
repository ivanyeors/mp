import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { disconnectTikTok } from "@/lib/social-inbox/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings → Users & permissions → Telegram → "Disconnect TikTok": revokes
 * the app's access with TikTok and deletes every stored TikTok message and
 * conversation (disconnectTikTok). Owners/admins only, like the rest of the tab.
 */
export async function POST() {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const result = await disconnectTikTok();
    await recordAdminAction({
      actor: ctx,
      action: "social_inbox.tiktok_disconnect",
      entityType: "social_channel",
      entityId: "tiktok",
      after: result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't disconnect TikTok" }, { status: 500 });
  }
}
