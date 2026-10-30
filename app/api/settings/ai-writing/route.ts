import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeCredentialSource } from "@/lib/ai/claude";
import { readAiWritingSettings, saveAiWritingSettings } from "@/lib/ai/settings";
import { readAiUsageThisMonth } from "@/lib/ai/usage";
import { AiWritingSettingsSchema } from "@/lib/ai/writing-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * General → AI writing (PRD-campaign-email-editor slice 16): the six
 * `site_settings` AI writing reads, where Claude's credentials come from, and
 * this month's use. Seeing and changing them need `api-configs`, the General
 * page's own key. The Claude API key is saved by /api/settings/claude-key.
 */
export async function GET() {
  try {
    await requireAdminContext("api-configs");
  } catch (res) {
    return res as NextResponse;
  }
  const admin = supabaseAdmin();
  const read = await readAiWritingSettings(admin);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 500 });
  // The settings still load when the month's use can't be read.
  const usage = await readAiUsageThisMonth(admin).catch((err: unknown) => {
    console.error("[ai-writing] usage read failed:", err instanceof Error ? err.message : err);
    return null;
  });
  const credentials = await claudeCredentialSource();
  return NextResponse.json({ ok: true, settings: read.settings, configured: credentials !== null, credentials, usage });
}

export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("api-configs");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = AiWritingSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the settings", field: issue?.path.join(".") }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const before = await readAiWritingSettings(admin);
  if (!before.ok) return NextResponse.json({ error: before.error }, { status: 500 });
  try {
    await saveAiWritingSettings(admin, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
  const after = await readAiWritingSettings(admin);
  invalidateTag("site-settings");
  await recordAdminAction({
    actor: ctx,
    action: "settings.ai_writing",
    entityType: "site_setting",
    entityId: "ai_writing",
    before: before.settings,
    after: after.ok ? after.settings : parsed.data,
  });
  return NextResponse.json({ ok: true, settings: after.ok ? after.settings : parsed.data });
}
