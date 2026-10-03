import { after, NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { isRateLimited } from "@/lib/rate-limit";
import { syncGoogleReviews } from "@/lib/reviews/google-sync";
import { isReviewNotification, notificationType } from "@/lib/reviews/pubsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sync drafts with Claude after the response; give it room to finish.
export const maxDuration = 300;

/**
 * Cloud Pub/Sub push endpoint for Google Business Profile notifications.
 *
 * Google publishes NEW_REVIEW / UPDATED_REVIEW to a Pub/Sub topic (set up with
 * scripts/google-business-setup.ts); a push subscription POSTs each message
 * here with `?token=<GOOGLE_REVIEWS_PUSH_TOKEN>` in its endpoint URL.
 *
 * The payload is read only to skip non-review notification types and is never
 * trusted: an accepted delivery just triggers a sync, which re-reads the
 * reviews from Google. A forged or duplicated message can therefore cause, at
 * most, an extra read.
 *
 * The response goes back at once (Pub/Sub redelivers anything it does not see
 * acknowledged within its deadline); the sync runs after it.
 */

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!secretMatches(process.env.GOOGLE_REVIEWS_PUSH_TOKEN?.trim(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const type = notificationType(body);
  // Unknown or unparseable still syncs — cheaper than missing a review.
  if (type && !isReviewNotification(type)) return new NextResponse(null, { status: 204 });

  // A burst of notifications needs one sync, not one each; the daily cron
  // catches anything a dropped trigger would have found.
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
