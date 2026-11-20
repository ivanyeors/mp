import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { pollPlacesReviews } from "@/lib/reviews/places-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ponytail: manual/ops only — not in vercel.json. The weekly read is chained
// from results-sla (lib/reviews/places-poll.ts); this one reads now, whatever
// the week, still counted against the monthly cap before it is made.

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return secretMatches(`Bearer ${secret}`, req.headers.get("authorization"));
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await pollPlacesReviews({ force: true });
    console.info("[google-places-reviews] poll", JSON.stringify(summary));
    return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "google places reviews poll failed" },
      { status: 500 },
    );
  }
}
