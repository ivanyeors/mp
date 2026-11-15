import { supabaseAdmin } from "@/lib/supabase/server";
import { googleReplyState, GOOGLE_REPLY_LABELS } from "@/lib/crm/reviews";
import { REVIEWS_GROUP } from "@/lib/crm/timeline/groups";
import { cappedBatch } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineEntry } from "@/lib/crm/timeline/types";

/**
 * Linked Google reviews (CRM slice 12) on the Customer timeline (`customers`),
 * under the Reviews chip. An entry appears once Staff have linked the review,
 * at the review's own date (`review_created_at`, or when we stored it), never
 * the date it was linked. Like a Shop review, its text stays off the timeline:
 * the Reviews card shows it in full. Its pill is whether we have replied.
 *
 * A Customer has a link or two at most (one review per Google account), so
 * they are read whole.
 */

type LinkRow = {
  google_review_id: string;
  google_reviews: {
    star_rating: number | null;
    review_created_at: string | null;
    created_at: string;
    status: string;
    google_reply: string | null;
  } | null;
};

export const googleReviewsAdapter: TimelineAdapter = {
  key: "google_reviews",
  group: REVIEWS_GROUP,
  kinds: ["google_review.written"],
  permission: "customers",
  async load(customer, before) {
    const { data, error } = await supabaseAdmin()
      .from("customer_google_reviews")
      .select("google_review_id, google_reviews!inner(star_rating, review_created_at, created_at, status, google_reply)")
      .eq("customer_id", customer.id);
    if (error) throw new Error(error.message);

    const entries = ((data ?? []) as unknown as LinkRow[]).flatMap((l): TimelineEntry[] => {
      const g = l.google_reviews;
      if (!g) return [];
      return [
        {
          id: `google_review.written:${l.google_review_id}`,
          at: g.review_created_at ?? g.created_at,
          kind: "google_review.written",
          ref: { type: "google_review", id: l.google_review_id },
          summary: g.star_rating ? `Google review: ${g.star_rating}★` : "Google review",
          status: GOOGLE_REPLY_LABELS[googleReplyState(g.status, Boolean(g.google_reply))],
          ...(g.star_rating ? { rating: g.star_rating } : {}),
        },
      ];
    });
    entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    // Everything was read, so nothing older is missing: no floor.
    return cappedBatch(entries, before, null);
  },
};
