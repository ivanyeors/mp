import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { renderShopReviewCard, type ShopReviewForCard } from "@/lib/reviews/cards";
import type { Actor } from "@/lib/reviews/google-actions";
import { checkReplyText } from "@/lib/reviews/reply-rules";
import { sendGroupCard } from "@/lib/telegram/bot-api";

type ProductContent = Record<string, { title?: string } | undefined> | null;

export function productTitle(product: { slug?: string | null; content?: ProductContent } | null): string | null {
  if (!product) return null;
  const content = product.content ?? {};
  const localized = content[DEFAULT_LOCALE] ?? Object.values(content)[0];
  return localized?.title?.trim() || product.slug || null;
}

const CARD_COLUMNS =
  "id,product_id,author_name,rating,title,body,status,created_at,store_reply,store_reply_at,store_reply_by_name";

export async function loadShopReviewForCard(id: string): Promise<ShopReviewForCard | null> {
  const admin = supabaseAdmin();
  const { data: review } = await admin.from("product_reviews").select(CARD_COLUMNS).eq("id", id).maybeSingle();
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
    store_reply: (review.store_reply as string | null) ?? null,
    store_reply_at: (review.store_reply_at as string | null) ?? null,
    store_reply_by_name: (review.store_reply_by_name as string | null) ?? null,
  };
}

export async function getShopReviewByCard(chatId: number, messageId: number): Promise<ShopReviewForCard | null> {
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_message_id", messageId)
    .maybeSingle();
  return data ? loadShopReviewForCard(data.id as string) : null;
}

export async function notifyNewShopReview(id: string): Promise<void> {
  try {
    const review = await loadShopReviewForCard(id);
    if (!review || review.status !== "pending") return;
    const card = renderShopReviewCard(review);
    const sent = await sendGroupCard(card.text, card.replyMarkup);
    if (!sent) return;
    await supabaseAdmin()
      .from("product_reviews")
      .update({ telegram_chat_id: sent.chatId, telegram_message_id: sent.messageId })
      .eq("id", id);
  } catch (error) {
    console.error("[reviews] shop review card failed", error);
  }
}

type ShopReviewResult = { ok: true; review: ShopReviewForCard } | { ok: false; review: ShopReviewForCard | null; message?: string };

export async function moderateShopReview(
  id: string,
  decision: "approved" | "rejected",
  card?: { chatId: number; messageId: number },
): Promise<ShopReviewResult> {
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .update({
      status: decision,
      ...(card ? { telegram_chat_id: card.chatId, telegram_message_id: card.messageId } : {}),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  const review = await loadShopReviewForCard(id);
  if (!data?.length || !review) return { ok: false, review };
  return { ok: true, review };
}

export async function setShopReviewReply(id: string, text: string, actor: Actor): Promise<ShopReviewResult> {
  const checked = checkReplyText(text);
  if (!checked.ok) return { ok: false, review: await loadShopReviewForCard(id), message: checked.error };
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .update({ store_reply: checked.text, store_reply_at: new Date().toISOString(), store_reply_by_name: actor.name })
    .eq("id", id)
    .in("status", ["pending", "approved"])
    .select("id");
  const review = await loadShopReviewForCard(id);
  if (!data?.length || !review) {
    return { ok: false, review, message: review ? "This review was rejected, so it isn't on the shop — nothing changed." : undefined };
  }
  return { ok: true, review };
}

export async function removeShopReviewReply(id: string): Promise<ShopReviewResult> {
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .update({ store_reply: null, store_reply_at: null, store_reply_by_name: null })
    .eq("id", id)
    .not("store_reply", "is", null)
    .select("id");
  const review = await loadShopReviewForCard(id);
  if (!data?.length || !review) return { ok: false, review };
  return { ok: true, review };
}
