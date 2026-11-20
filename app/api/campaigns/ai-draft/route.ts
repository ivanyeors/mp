import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { aiUsageAuditEntry } from "@/lib/ai/usage";
import { openAiWritingCall } from "@/lib/ai/writing-call";
import { campaignForAiWriting } from "@/lib/email-campaigns/ai-campaign";
import { runCampaignDraft, type DraftBrief } from "@/lib/email-campaigns/ai-draft";
import { DraftRequestSchema, type DraftEvent } from "@/lib/email-campaigns/ai-draft-shape";
import { draftBlocker } from "@/lib/email-campaigns/ai-drafted";
import { readCampaignProductCards } from "@/lib/email-campaigns/products";
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

  const parsed = DraftRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the brief." }, { status: 400 });
  const request = parsed.data;
  const blocked = draftBlocker(request.subject, request.name);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const admin = supabaseAdmin();
  const call = await openAiWritingCall(admin, ctx.memberId);
  if (!call.ok) return NextResponse.json({ error: call.error }, { status: call.status });
  const { settings, client } = call;

  let brief: DraftBrief;
  try {
    const campaign = await campaignForAiWriting(admin, request.campaignId);
    if (!campaign.ok) return NextResponse.json({ error: campaign.error }, { status: campaign.status });
    const cards = await readCampaignProductCards(admin, request.products);
    const unlisted = cards.find((c) => !c.listed || !c.title);
    if (unlisted) {
      return NextResponse.json({ error: `${unlisted.title ?? "A product"} is no longer in the shop: choose another.` }, { status: 400 });
    }
    brief = { request, products: cards.map((c) => ({ id: c.id, title: c.title as string })), pointsLive: campaign.pointsLive, adding: request.existing.length > 0 };
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const draftId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DraftEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {}
      };
      const outcome = await runCampaignDraft(brief, { client, settings, emit: send, signal: req.signal });
      const { action, after } = aiUsageAuditEntry("draft", {
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
          draft_id: draftId,
          scope: request.scope,
          ended: outcome.stopped ? "stopped" : outcome.ok ? "drafted" : "failed",
          attempts: outcome.attempts,
          blocks: outcome.blocks,
          kept: false,
        },
      });
      if (!outcome.ok) send({ type: "error", error: outcome.error ?? "Drafting failed." });
      else if (!outcome.stopped) send({ type: "done", draftId, notes: outcome.notes });
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
