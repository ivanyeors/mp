import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";
import type { GuideTopic } from "@/lib/seo/guides-content";
import { selectTopicReviews, type RawReview, type TopicReview } from "@/lib/seo/topic-reviews";

/** Guides render per request; one Shop review read an hour, shared by every topic, is plenty. */
const getStoreReviews = unstable_cache(
  async (): Promise<RawReview[]> => {
    try {
      const { data, error } = await supabaseAdmin()
        .from("product_reviews")
        .select("title, body, author_name, rating, created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) return [];
      return (data ?? []).map((r) => ({
        title: r.title as string | null,
        body: r.body as string | null,
        authorName: r.author_name as string | null,
        rating: r.rating as number | null,
        date: (r.created_at as string | null) ?? null,
        source: "store" as const,
      }));
    } catch {
      return [];
    }
  },
  ["topic-reviews-store"],
  { revalidate: 3600 },
);

/**
 * Deliberately outside unstable_cache: Next runs a fetch inside it as no-store, so each
 * topic's hourly refresh was a billed Places call. Out here it shares the landing page's
 * cached response (PLACE_REVIEWS_REVALIDATE_SECONDS).
 */
async function getGoogleReviews(): Promise<RawReview[]> {
  try {
    const reviews = await getGooglePlaceTestimonials({ limit: 20 });
    return reviews.map((g) => ({
      body: g.quote,
      authorName: g.name,
      rating: g.rating ?? null,
      date: g.publishedAt ?? null,
      source: "google" as const,
    }));
  } catch {
    return [];
  }
}

/** Server loader for slice 12. Never throws: a page without quotes beats a broken page. */
export async function getTopicReviews(topic: GuideTopic, limit = 4): Promise<TopicReview[]> {
  const [store, google] = await Promise.all([getStoreReviews(), getGoogleReviews()]);
  return selectTopicReviews([...store, ...google], topic, limit);
}
