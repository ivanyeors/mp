import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { claudeCredentialSource } from "@/lib/ai/claude";
import { ClaudeKeySchema, askAnthropic, claudeKeyRefusal, claudeKeySaved, removeClaudeKey, saveClaudeKey } from "@/lib/ai/claude-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("api-configs");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = ClaudeKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Paste an Anthropic API key" }, { status: 400 });
  }
  const { apiKey } = parsed.data;

  try {
    await askAnthropic(apiKey);
  } catch (err) {
    return NextResponse.json({ error: claudeKeyRefusal(err) }, { status: 400 });
  }

  const admin = supabaseAdmin();
  try {
    const before = await claudeKeySaved(admin);
    await saveClaudeKey(admin, apiKey);
    invalidateTag("api-configs");
    await recordAdminAction({
      actor: ctx,
      action: before ? "settings.claude_key_replace" : "settings.claude_key_add",
      entityType: "api_config",
      entityId: "anthropic",
      before: { saved: before },
      after: { saved: true },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save the key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, credentials: await claudeCredentialSource() });
}

export async function DELETE() {
  let ctx;
  try {
    ctx = await requireAdminContext("api-configs");
  } catch (res) {
    return res as NextResponse;
  }

  const admin = supabaseAdmin();
  try {
    if (await claudeKeySaved(admin)) {
      await removeClaudeKey(admin);
      invalidateTag("api-configs");
      await recordAdminAction({
        actor: ctx,
        action: "settings.claude_key_remove",
        entityType: "api_config",
        entityId: "anthropic",
        before: { saved: true },
        after: { saved: false },
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't remove the key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, credentials: await claudeCredentialSource() });
}
