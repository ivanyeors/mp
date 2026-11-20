import { after, NextResponse } from "next/server";
import { ingestSocialEvents, sweepUncarded } from "@/lib/social-inbox/ingest";
import { getTikTokTokenRow, parseTikTokWebhook, verifyTikTokSignature } from "@/lib/social-inbox/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyTikTokSignature(rawBody, req.headers.get("tiktok-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    try {
      const connected = await getTikTokTokenRow();
      const events = parseTikTokWebhook(payload, connected?.account_id ?? null);
      if (events.length === 0) return;
      const summary = await ingestSocialEvents(events);
      await sweepUncarded({ max: 3 });
      if (summary.failed) console.warn("[social-inbox] tiktok ingest", JSON.stringify(summary));
    } catch (error) {
      console.error("[social-inbox] tiktok ingest failed", error);
    }
  });
  return NextResponse.json({ ok: true });
}
