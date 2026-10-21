import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { renderShopReviewCard, type ShopReviewForCard } from "@/lib/reviews/cards";
import { sendGroupCard } from "@/lib/telegram/bot-api";

/**
 * Website reviews (`product_reviews`) in the measurements Telegram group.
 * A new submission arrives `pending`; a shop moderator approves it onto the
 * product page or rejects it. There is no public reply to post — that flow is
 * Google-only — so the card has no reply affordance.
 */

type ProductContent = Record<string, { title?: string } | undefined> | null;

/** A product's name for Staff: its default-locale title, else its slug. Also the Customer timeline's. */
export function productTitle(product: { slug?: string | null; content?: ProductContent } | null): string | null {
  if (!product) return null;
  const content = product.content ?? {};
  const localized = content[DEFAULT_LOCALE] ?? Object.values(content)[0];
  return localized?.title?.trim() || product.slug || null;
}

export async function loadShopReviewForCard(id: string): Promise<ShopReviewForCard | null> {
  const admin = supabaseAdmin();
  const { data: review } = await admin
    .from("product_reviews")
    .select("id,product_id,author_name,rating,title,body,status,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!review) return null;
  const { data: product } = await admin
    .from("products")
    .select("slug,content")
    .eq("id", review.product_id)
    .maybeSingle();
  return {
    id: review.id as string,
    author_name: review.author_name as string,
    rating: review.rating as number,
    title: (review.title as string | null) ?? null,
    body: (review.body as string | null) ?? null,
    status: review.status as ShopReviewForCard["status"],
    created_at: (review.created_at as string | null) ?? null,
    productName: productTitle(product as { slug?: string | null; content?: ProductContent } | null),
  };
}

/** Best-effort: a submitted review stands whether or not the card goes out. */
export async function notifyNewShopReview(id: string): Promise<void> {
  try {
    const review = await loadShopReviewForCard(id);
    if (!review || review.status !== "pending") return;
    const card = renderShopReviewCard(review);
    await sendGroupCard(card.text, card.replyMarkup);
  } catch (error) {
    console.error("[reviews] shop review card failed", error);
  }
}

/** pending → approved | rejected, once. A second tap reports the outcome instead. */
export async function moderateShopReview(
  id: string,
  decision: "approved" | "rejected",
): Promise<{ ok: true; review: ShopReviewForCard } | { ok: false; review: ShopReviewForCard | null }> {
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .update({ status: decision })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  const review = await loadShopReviewForCard(id);
  if (!data?.length || !review) return { ok: false, review };
  return { ok: true, review };
}
