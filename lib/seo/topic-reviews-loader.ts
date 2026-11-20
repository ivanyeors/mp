import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";
import type { GuideTopic } from "@/lib/seo/guides-content";
import { selectTopicReviews, type RawReview, type TopicReview } from "@/lib/seo/topic-reviews";

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

export async function getTopicReviews(topic: GuideTopic, limit = 4): Promise<TopicReview[]> {
  const [store, google] = await Promise.all([getStoreReviews(), getGoogleReviews()]);
  return selectTopicReviews([...store, ...google], topic, limit);
}
