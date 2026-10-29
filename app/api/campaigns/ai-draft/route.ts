import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { claudeClient } from "@/lib/ai/claude";
import { aiWritingLimited } from "@/lib/ai/limits";
import { readAiWritingSettings } from "@/lib/ai/settings";
import { aiUsageAuditEntry } from "@/lib/ai/usage";
import { AI_WRITING_NO_CREDENTIALS, AI_WRITING_SWITCHED_OFF } from "@/lib/ai/availability";
import { runCampaignDraft, type DraftBrief } from "@/lib/email-campaigns/ai-draft";
import { DraftRequestSchema, type DraftEvent } from "@/lib/email-campaigns/ai-draft-shape";
import { draftBlocker } from "@/lib/email-campaigns/ai-drafted";
import { readCampaignProductCards } from "@/lib/email-campaigns/products";
import { getCampaign } from "@/lib/email-campaigns/store";
import { claimBonusOffer } from "@/lib/points/offer";
import { readPointsSettings } from "@/lib/points/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A draft streams for well under a minute; this is the ceiling, not the plan.
export const maxDuration = 300;

/**
 * ✨ Generate (PRD-campaign-email-editor slice 09): Claude writes a
 * campaign's blocks from its subject and Staff's brief, streamed back to the
 * editor one line of JSON per event (`DraftEvent`) as each block is written
 * and checked. A route, not a server action, so the editor reads it as it
 * arrives and Stop ends it (the request's signal).
 *
 * In order: the `campaigns` permission; the brief; the AI writing settings,
 * read now (switched off, or unread, is no); the credentials; the per-Staff
 * limits; then the call. It reads the picked products' names and whether
 * points are live, and never a customer. It writes one thing, the audit entry
 * (`email_campaign.ai_draft`, with the model that served it and its tokens,
 * never the brief's text): no campaign, no `content`, no send. What it
 * returns goes into the editor, and only Staff save or send it.
 */
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
  const read = await readAiWritingSettings(admin);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 503 });
  const { settings } = read;
  if (!settings.enabled) return NextResponse.json({ error: AI_WRITING_SWITCHED_OFF }, { status: 403 });
  const client = claudeClient();
  if (!client) return NextResponse.json({ error: AI_WRITING_NO_CREDENTIALS }, { status: 503 });

  const limited = await aiWritingLimited(settings, ctx.memberId);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  let brief: DraftBrief;
  try {
    // A started campaign's email is fixed: nothing writes into it, Claude included.
    if (request.campaignId) {
      const campaign = await getCampaign(admin, request.campaignId.toLowerCase());
      if (!campaign) return NextResponse.json({ error: "That campaign does not exist." }, { status: 404 });
      if (campaign.lockedAt) return NextResponse.json({ error: "Sending has started, so the email is fixed." }, { status: 409 });
    }
    const cards = await readCampaignProductCards(admin, request.products);
    const unlisted = cards.find((c) => !c.listed || !c.title);
    if (unlisted) {
      return NextResponse.json({ error: `${unlisted.title ?? "A product"} is no longer in the shop: choose another.` }, { status: 400 });
    }
    const pointsLive = await readPointsSettings(admin)
      .then((s) => claimBonusOffer(s).live)
      .catch(() => false);
    brief = { request, products: cards.map((c) => ({ id: c.id, title: c.title as string })), pointsLive, adding: request.existing.length > 0 };
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const draftId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // After Stop the editor reads no more: what is left to say is dropped.
      const send = (event: DraftEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The stream was cancelled.
        }
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
          // *Keep* records `email_campaign.ai_draft_kept` with this draft's id.
          kept: false,
        },
      });
      if (!outcome.ok) send({ type: "error", error: outcome.error ?? "Drafting failed." });
      else if (!outcome.stopped) send({ type: "done", draftId, notes: outcome.notes });
      try {
        controller.close();
      } catch {
        // Already cancelled.
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
