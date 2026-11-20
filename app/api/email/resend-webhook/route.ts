import { NextResponse } from "next/server";
import { recordCampaignSendEvent } from "@/lib/customer-migration/campaign-ledger";
import { readWebhookEvent, verifyWebhookSignature, webhookHeaders } from "@/lib/email/resend-webhook";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CAMPAIGN_RESEND_WEBHOOK_SECRET || undefined;
  if (!secret) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = await req.text();
  if (!verifyWebhookSignature(secret, webhookHeaders(req.headers), body)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event = readWebhookEvent(payload);
  if (event.kind === "ignored") return NextResponse.json({ ok: true, ignored: event.type });

  const result = await recordCampaignSendEvent(supabaseAdmin(), {
    providerMessageId: event.emailId,
    event: event.kind,
    at: event.at,
  });
  if (!result.ok) {
    console.error(`[resend-webhook] could not record ${event.kind}:`, result.error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    event: event.kind,
    matched: result.found,
    changed: result.changed,
    unsubscribed: result.unsubscribed,
  });
}
