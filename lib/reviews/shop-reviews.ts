import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { renderShopReviewCard, type ShopReviewForCard } from "@/lib/reviews/cards";
import type { Actor } from "@/lib/reviews/google-actions";
import { checkReplyText } from "@/lib/reviews/reply-rules";
import { sendGroupCard } from "@/lib/telegram/bot-api";

/**
 * Website reviews (`product_reviews`) in the measurements Telegram group.
 *
 * A signed-in Customer submits one (app/api/shop/reviews); it arrives
 * `pending`, and its card goes to the group with Approve / Reject for a shop
 * moderator (`telegram.shop-review-moderate`). The card's message id is kept
 * on the review, so a reply to the card finds it.
 *
 * Our public reply: someone allowed `telegram.shop-review-reply` replies to
 * the card with the words to show, on a pending or approved review. It is set
 * at once — there is no draft or Post step, and no Claude draft — and appears
 * under the review on the product page while the review is approved. Replying
 * again replaces it; the card's Remove reply takes it down. A reply starting
 * with `//` is a team note and is left alone, as on Google cards
 * (lib/reviews/telegram-handler.ts).
 */

type ProductContent = Record<string, { title?: string } | undefined> | null;

/** A product's name for Staff: its default-locale title, else its slug. Also the Customer timeline's. */
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

/** The review a card in the group belongs to, or null (not a shop card, or sent before cards were recorded). */
export async function getShopReviewByCard(chatId: number, messageId: number): Promise<ShopReviewForCard | null> {
  const { data } = await supabaseAdmin()
    .from("product_reviews")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_message_id", messageId)
    .maybeSingle();
  return data ? loadShopReviewForCard(data.id as string) : null;
}

/** Best-effort: a submitted review stands whether or not the card goes out. */
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

/**
 * pending → approved | rejected, once. A second tap reports the outcome instead.
 * `card` is the message tapped: it is the review's card, recorded so a reply
 * to it works even on a card sent before card ids were kept.
 */
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

/**
 * Sets our public reply, replacing any earlier one. Only on a pending or
 * approved review: a rejected one is not on the shop, so there is nothing to
 * answer. The text is checked like a Google reply (trimmed, not empty, at
 * most MAX_REPLY_CHARS).
 */
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

/** Takes our reply down, whatever the review's status. Reports when there was none. */
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
