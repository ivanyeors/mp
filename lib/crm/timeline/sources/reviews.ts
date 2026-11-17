import { supabaseAdmin } from "@/lib/supabase/server";
import { productTitle } from "@/lib/reviews/shop-reviews";
import { REVIEWS_GROUP } from "@/lib/crm/timeline/groups";
import { readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

/**
 * Shop reviews on the Customer timeline (`customers`). A review stores when it
 * was submitted, not when it was approved or rejected (`updated_at` moves on
 * every edit), so the moderation outcome is its status pill. Its text stays on
 * the product page: the entry carries the rating and the product only.
 */

type Product = { slug: string | null; content: Record<string, { title?: string } | undefined> | null };

type ReviewRow = {
  id: string;
  rating: number;
  status: string;
  created_at: string;
  products: Product | Product[] | null;
};

export const reviewsAdapter: TimelineAdapter = {
  key: "reviews",
  group: REVIEWS_GROUP,
  kinds: ["review.submitted"],
  permission: "customers",
  load(customer, before, limit) {
    return readStream<ReviewRow>(
      supabaseAdmin()
        .from("product_reviews")
        .select("id, rating, status, created_at, products!inner(slug, content)")
        .eq("customer_id", customer.id),
      "created_at",
      before,
      limit,
      (r) => {
        const product = productTitle(Array.isArray(r.products) ? (r.products[0] ?? null) : r.products);
        return {
          id: `review.submitted:${r.id}`,
          at: r.created_at,
          kind: "review.submitted",
          ref: { type: "product_review", id: r.id },
          summary: `Shop review: ${r.rating}★${product ? ` on ${product}` : ""}`,
          status: r.status,
          rating: r.rating,
        };
      },
    );
  },
};
