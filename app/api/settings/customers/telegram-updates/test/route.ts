import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getPublicOrigin } from "@/lib/site-url";
import { readTelegramUpdates, sendTelegramUpdatesTest } from "@/lib/crm/telegram-updates-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customers → Settings → Telegram updates → *Send test* (CRM slice 14): each
 * enabled type once, with sample numbers, marked TEST, to the Staff group. The
 * online Result sample is a made-up build for `test@example.com`, never a real
 * Result. The precedent is the review cards' *Send preview*. Needs
 * `customers-edit`, like every change on the card.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (res) {
    return res as NextResponse;
  }

  let settings;
  try {
    settings = await readTelegramUpdates();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }

  const result = await sendTelegramUpdatesTest(settings, { origin: getPublicOrigin(req) });
  await recordAdminAction({
    actor: ctx,
    action: "crm_telegram_updates.test",
    entityType: "site_setting",
    entityId: "crm_telegram_updates",
    after: result,
  });
  if (result.telegram === "skipped") {
    return NextResponse.json({ ...result, error: "No Telegram bot token is configured." }, { status: 503 });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
