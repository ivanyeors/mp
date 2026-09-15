import { supabaseAdmin } from "@/lib/supabase/server";

export type ReviewAggregate = {
  average: number;
  count: number;
};

export type LandingRatings = {
  basic: ReviewAggregate;
  premium: ReviewAggregate;
  bolster: ReviewAggregate;
};

const EMPTY: ReviewAggregate = { average: 0, count: 0 };

export async function getReviewAggregate(productId: string): Promise<ReviewAggregate> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "approved");

  if (error || !data?.length) return EMPTY;

  const count = data.length;
  const sum = data.reduce((acc, row) => acc + (row.rating ?? 0), 0);
  return { average: sum / count, count };
}

/** Batch fetch for shop/homepage cards. ponytail: O(n) products — fine for storefront scale. */
export async function getReviewAggregates(
  productIds: string[],
): Promise<Record<string, ReviewAggregate>> {
  if (!productIds.length) return {};

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("product_reviews")
    .select("product_id, rating")
    .in("product_id", productIds)
    .eq("status", "approved");

  if (error || !data?.length) {
    return Object.fromEntries(productIds.map((id) => [id, EMPTY]));
  }

  const buckets = new Map<string, number[]>();
  for (const row of data) {
    const list = buckets.get(row.product_id) ?? [];
    list.push(row.rating ?? 0);
    buckets.set(row.product_id, list);
  }

  const out: Record<string, ReviewAggregate> = {};
  for (const id of productIds) {
    const ratings = buckets.get(id);
    if (!ratings?.length) {
      out[id] = EMPTY;
      continue;
    }
    const count = ratings.length;
    const sum = ratings.reduce((a, b) => a + b, 0);
    out[id] = { average: sum / count, count };
  }
  return out;
}
