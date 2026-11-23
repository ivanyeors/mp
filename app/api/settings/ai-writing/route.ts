import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readAiWritingSettings, saveAiWritingSettings } from "@/lib/ai/settings";
import { AiWritingSettingsSchema } from "@/lib/ai/writing-settings";

export const runtime = "nodejs";

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
