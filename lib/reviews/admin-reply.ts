import { supabaseAdmin } from "@/lib/supabase/server";
import { editGroupCard } from "@/lib/telegram/bot-api";
import { customerMatchLinkFor } from "@/lib/crm/google-review-match-server";
import { renderGoogleReviewCard } from "@/lib/reviews/cards";
import { draftInputFor, draftReviewReply, type DraftResult, type ReviewForDraft } from "@/lib/reviews/draft-reply";
import { GOOGLE_REVIEW_COLUMNS, getGoogleReview, type GoogleReviewRow } from "@/lib/reviews/google-reviews";
import { MARKABLE_STATUSES, canMarkReplied } from "@/lib/reviews/mark-replied";
import { checkReplyText } from "@/lib/reviews/reply-rules";

/**
 * Replying to a Google review from the Customer page's Reviews tab
 * (PRD-customer-page-journey slice 03). Nothing here posts to Google: a Staff
 * member copies the reply, pastes it on Google themselves, and says so.
 *
 * The Telegram card stays the other way in (lib/reviews/google-actions.ts).
 * Both share one row, so every write here is guarded on `status` the way those
 * are, and a card that is open in Telegram is redrawn after a change so the
 * two never show different drafts.
 */

type Deps = {
  draft?: (review: ReviewForDraft) => Promise<DraftResult>;
  edit?: typeof editGroupCard;
  matchLink?: (reviewId: string) => Promise<string | null>;
};

/** Redraws the review's Telegram card, when it has one. Best-effort: Telegram being down never fails the action. */
async function refreshCard(row: GoogleReviewRow, deps: Deps): Promise<void> {
  if (!row.telegram_message_id) return;
  try {
    const link = await (deps.matchLink ?? customerMatchLinkFor)(row.id);
    const card = renderGoogleReviewCard(row, { possibleCustomerMatch: link });
    await (deps.edit ?? editGroupCard)(row.telegram_message_id, card.text, card.replyMarkup);
  } catch (e) {
    console.error("[review-reply] telegram card refresh failed:", e instanceof Error ? e.message : e);
  }
}

export type RedraftResult =
  | { ok: true; reply: string; /** Stored on the review, so Telegram shows it too. */ saved: boolean }
  | { ok: false; reason: "not_found" | "draft_failed"; message: string };

/**
 * A fresh draft from Claude, by the same prompt and rules as the Telegram card
 * (lib/reviews/draft-reply.ts). A review still waiting for an answer keeps the
 * draft: it is saved, its version moves on (so a Post tapped on the old card
 * is refused as stale), and the card is redrawn. Any other review gets the
 * draft back without a write, because its row is settled.
 */
export async function redraftReviewReply(reviewId: string, deps: Deps = {}): Promise<RedraftResult> {
  const row = await getGoogleReview(reviewId);
  if (!row) return { ok: false, reason: "not_found", message: "This review is no longer stored." };

  const result = await (deps.draft ?? draftReviewReply)(draftInputFor(row));
  if (!result.ok) return { ok: false, reason: "draft_failed", message: result.error };

  if (row.status !== "pending") return { ok: true, reply: result.reply, saved: false };

  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update({
      draft_reply: result.reply,
      draft_source: "claude",
      draft_version: row.draft_version + 1,
      draft_error: null,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("draft_version", row.draft_version)
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  // Someone acted in Telegram meanwhile: the draft is still good to copy.
  if (!data) return { ok: true, reply: result.reply, saved: false };
  await refreshCard(data as GoogleReviewRow, deps);
  return { ok: true, reply: result.reply, saved: true };
}

export type MarkRepliedResult =
  | { ok: true; row: GoogleReviewRow }
  | { ok: false; reason: "not_found" | "invalid" | "already" | "not_places"; message: string };

/**
 * A Staff member posted the reply on Google themselves. Only for a review read
 * through the Places API, which cannot show us replies: the text they copied
 * is the only record of it. A Business Profile review needs no mark, because
 * the sync reads the reply from Google.
 */
export async function markReviewRepliedByStaff(
  reviewId: string,
  reply: string,
  actorName: string,
  deps: Deps = {},
): Promise<MarkRepliedResult> {
  const checked = checkReplyText(reply);
  if (!checked.ok) return { ok: false, reason: "invalid", message: checked.error };

  const row = await getGoogleReview(reviewId);
  if (!row) return { ok: false, reason: "not_found", message: "This review is no longer stored." };
  if (row.source !== "places") {
    return {
      ok: false,
      reason: "not_places",
      message: "Google tells us when this review is answered, so there is nothing to mark.",
    };
  }
  if (!canMarkReplied(row)) return { ok: false, reason: "already", message: "This review is already marked as answered." };

  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update({
      status: "posted",
      posted_reply: checked.text,
      posted_at: new Date().toISOString(),
      last_error: null,
      acted_by_telegram_user_id: null,
      acted_by_name: actorName,
    })
    .eq("id", row.id)
    .eq("source", "places")
    .in("status", [...MARKABLE_STATUSES])
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (!data) return { ok: false, reason: "already", message: "Someone already dealt with this review." };
  const updated = data as GoogleReviewRow;
  await refreshCard(updated, deps);
  return { ok: true, row: updated };
}
