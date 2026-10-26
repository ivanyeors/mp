import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { connectMetaWebhooks, productionMetaWebhookUrl } from "@/lib/social-inbox/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings → Users & permissions → Telegram → "Connect webhooks": points the
 * Meta app's Page and Instagram webhooks at this site and subscribes the Page
 * (OPS checklist part 1, steps 5–6). Production only — Meta has one callback
 * URL per app, and a preview must never take it. Owners/admins only, like the
 * rest of the tab.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  const callbackUrl = productionMetaWebhookUrl(req);
  if (!callbackUrl) {
    return NextResponse.json(
      { error: "Connect from the production site — Meta sends messages to whichever site does this." },
      { status: 409 },
    );
  }

  const result = await connectMetaWebhooks(callbackUrl);
  await recordAdminAction({
    actor: ctx,
    action: "social_inbox.meta_connect",
    entityType: "social_channel",
    entityId: "meta",
    after: { callback_url: callbackUrl, ok: result.ok, error: result.ok ? null : result.error },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
