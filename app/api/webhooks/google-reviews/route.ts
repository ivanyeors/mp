import { after, NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { isRateLimited } from "@/lib/rate-limit";
import { syncGoogleReviews } from "@/lib/reviews/google-sync";
import { isReviewNotification, notificationType } from "@/lib/reviews/pubsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!secretMatches(process.env.GOOGLE_REVIEWS_PUSH_TOKEN?.trim(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const type = notificationType(body);
  if (type && !isReviewNotification(type)) return new NextResponse(null, { status: 204 });

  if (!isRateLimited({ bucket: "google-reviews-push", key: "sync", windowMs: 60_000, max: 10 })) {
    after(async () => {
      try {
        const summary = await syncGoogleReviews();
        console.info("[google-reviews] push sync", type ?? "unknown", JSON.stringify(summary));
      } catch (error) {
        console.error("[google-reviews] push sync failed", error);
      }
    });
  }
  return new NextResponse(null, { status: 204 });
}
