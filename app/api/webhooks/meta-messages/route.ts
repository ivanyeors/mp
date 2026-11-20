import { after, NextResponse } from "next/server";
import { ingestSocialEvents, sweepUncarded } from "@/lib/social-inbox/ingest";
import { metaAccountIds, parseMetaWebhook, verifyMetaChallenge, verifyMetaSignature } from "@/lib/social-inbox/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challenge = verifyMetaChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  if (challenge == null) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const events = parseMetaWebhook(payload, metaAccountIds());
  if (events.length > 0) {
    after(async () => {
      try {
        const summary = await ingestSocialEvents(events);
        await sweepUncarded({ max: 3 });
        if (summary.failed) console.warn("[social-inbox] meta ingest", JSON.stringify(summary));
      } catch (error) {
        console.error("[social-inbox] meta ingest failed", error);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
