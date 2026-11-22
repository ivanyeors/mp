import { supabaseAdmin } from "@/lib/supabase/server";
import type { PublicProductReview } from "@/lib/types/ecommerce";

export const PUBLIC_REVIEW_COLUMNS = "id, rating, title, body, author_name, created_at, store_reply, store_reply_at";

export async function readApprovedReviews(
  productId: string,
  page = 1,
  limit = 100,
): Promise<{ rows: PublicProductReview[]; total: number }> {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin()
    .from("product_reviews")
    .select(PUBLIC_REVIEW_COLUMNS, { count: "exact" })
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as PublicProductReview[], total: count ?? 0 };
}
