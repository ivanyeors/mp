import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { aiUsageAuditEntry } from "@/lib/ai/usage";
import { openAiWritingCall } from "@/lib/ai/writing-call";
import { campaignForAiWriting } from "@/lib/email-campaigns/ai-campaign";
import { TRANSLATE_LIMIT_LEAD, runCampaignTranslate } from "@/lib/email-campaigns/ai-translate";
import { TranslateRequestSchema, translateBlocker } from "@/lib/email-campaigns/ai-translate-shape";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("campaigns");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = TranslateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the request." }, { status: 400 });
  const request = parsed.data;
  const blocked = translateBlocker(request);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const admin = supabaseAdmin();
  const call = await openAiWritingCall(admin, ctx.memberId, { lead: TRANSLATE_LIMIT_LEAD });
  if (!call.ok) return NextResponse.json({ error: call.error }, { status: call.status });

  try {
    const campaign = await campaignForAiWriting(admin, request.campaignId);
    if (!campaign.ok) return NextResponse.json({ error: campaign.error }, { status: campaign.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const outcome = await runCampaignTranslate(request, { client: call.client, settings: call.settings, signal: req.signal });
  const { action, after } = aiUsageAuditEntry("translate", {
    model: outcome.model,
    usage: { input_tokens: outcome.inputTokens, output_tokens: outcome.outputTokens },
  });
  await recordAdminAction({
    actor: ctx,
    action,
    entityType: "email_campaign",
    entityId: request.campaignId,
    after: {
      ...after,
      ended: outcome.stopped ? "stopped" : outcome.ok ? "translated" : "failed",
      attempts: outcome.attempts,
      scope: request.only ? "blocks" : "email",
      blocks: outcome.blocks,
      lines: request.lines,
    },
  });
  if (outcome.stopped) return NextResponse.json({ error: "Stopped." }, { status: 499 });
  if (!outcome.ok || !outcome.translation) return NextResponse.json({ error: outcome.error ?? "Claude couldn't translate it." }, { status: 502 });
  return NextResponse.json({ translation: outcome.translation }, { headers: { "cache-control": "no-store" } });
}
