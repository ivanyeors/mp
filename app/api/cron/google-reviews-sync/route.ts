import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { syncGoogleReviews } from "@/lib/reviews/google-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ponytail: manual/ops only — not in vercel.json (also chained from results-sla).
// The Pub/Sub push at /api/webhooks/google-reviews is the real-time path.

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  return secretMatches(`Bearer ${secret}`, req.headers.get("authorization"));
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncGoogleReviews());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "google reviews sync failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
