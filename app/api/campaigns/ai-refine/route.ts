import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { aiUsageAuditEntry } from "@/lib/ai/usage";
import { openAiWritingCall } from "@/lib/ai/writing-call";
import { campaignForAiWriting } from "@/lib/email-campaigns/ai-campaign";
import { REFINE_LIMIT_LEAD, runCampaignRefine } from "@/lib/email-campaigns/ai-refine";
import { ideasBlocker, type RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import { RefineRequestSchema, rewriteBlocker } from "@/lib/email-campaigns/ai-refine-shape";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("campaigns");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = RefineRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the request." }, { status: 400 });
  const request = parsed.data;
  const blocked = request.kind === "rewrite" ? rewriteBlocker(request.block as RewritableBlock) : ideasBlocker(request.kind, request);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const admin = supabaseAdmin();
  const call = await openAiWritingCall(admin, ctx.memberId, { lead: REFINE_LIMIT_LEAD });
  if (!call.ok) return NextResponse.json({ error: call.error }, { status: call.status });

  let pointsLive: boolean;
  try {
    const campaign = await campaignForAiWriting(admin, request.campaignId);
    if (!campaign.ok) return NextResponse.json({ error: campaign.error }, { status: campaign.status });
    pointsLive = campaign.pointsLive;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const outcome = await runCampaignRefine({ request, pointsLive }, { client: call.client, settings: call.settings, signal: req.signal });
  const { action, after } = aiUsageAuditEntry(request.kind, {
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
      ended: outcome.stopped ? "stopped" : outcome.ok ? "suggested" : "failed",
      attempts: outcome.attempts,
      ...(request.kind === "rewrite"
        ? { rewrite: request.action, block_type: request.block.type }
        : { ideas: outcome.result?.kind === request.kind ? outcome.result.ideas.length : 0, more: request.exclude.length > 0 }),
    },
  });
  if (outcome.stopped) return NextResponse.json({ error: "Stopped." }, { status: 499 });
  if (!outcome.ok || !outcome.result) return NextResponse.json({ error: outcome.error ?? "Claude couldn't answer." }, { status: 502 });
  return NextResponse.json(outcome.result, { headers: { "cache-control": "no-store" } });
}
