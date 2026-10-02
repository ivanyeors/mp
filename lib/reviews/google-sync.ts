import { supabaseAdmin } from "@/lib/supabase/server";
import {
  businessProfileClientFromConfig,
  getBusinessProfileConfig,
  isReviewName,
  starRatingToNumber,
  type BusinessProfileClient,
  type GbpReview,
} from "@/lib/google/business-profile";
import { draftReviewReply } from "@/lib/reviews/draft-reply";
import { renderGoogleReviewCard } from "@/lib/reviews/cards";
import { replyStyleFor } from "@/lib/reviews/reply-style";
import { editGroupCard, sendGroupCard } from "@/lib/telegram/bot-api";
import { GOOGLE_REVIEW_COLUMNS, type GoogleReviewRow } from "@/lib/reviews/google-reviews";

/**
 * Pull the newest Google reviews and turn new ones into Telegram cards.
 *
 * Runs on every Pub/Sub notification (NEW_REVIEW / UPDATED_REVIEW) and once a
 * day from the results-sla cron as a catch-up, because Pub/Sub delivery is not
 * guaranteed. It never trusts a notification's payload — it re-reads Google —
 * so a duplicate or forged delivery can only cause an extra read.
 *
 * Idempotent and safe to run concurrently: rows are keyed by the review's
 * resource name, a card is only sent by whoever atomically claims the row
 * (new → pending), and a card whose send failed is retried on a later run.
 */

/** Reviews older than this when first seen are recorded but get no card. */
export const NOTIFY_WINDOW_DAYS = 14;
/** Caps a first sync (or an outage catch-up) so it cannot flood the group. */
export const DEFAULT_MAX_CARDS = 10;
/** A claimed row with no card after this long is treated as a crashed send. */
const STALE_MS = 10 * 60 * 1000;

export type ReviewSyncDeps = {
  client?: BusinessProfileClient;
  location?: string;
  now?: Date;
  maxCards?: number;
  draft?: typeof draftReviewReply;
  send?: typeof sendGroupCard;
  edit?: typeof editGroupCard;
};

export type ReviewSyncSummary = {
  ok: true;
  skipped?: "not_configured";
  fetched: number;
  inserted: number;
  backlog: number;
  updated: number;
  repliedElsewhere: number;
  /** Open cards whose rating moved into another reply type, redrafted to match. */
  redrafted: number;
  recovered: number;
  carded: number;
};

export function reviewFields(review: GbpReview) {
  return {
    review_name: review.name,
    star_rating: starRatingToNumber(review.starRating),
    comment: review.comment?.trim() || null,
    reviewer_name: review.reviewer?.displayName?.trim() || null,
    reviewer_is_anonymous: Boolean(review.reviewer?.isAnonymous),
    review_created_at: review.createTime ?? null,
    review_updated_at: review.updateTime ?? null,
    google_reply: review.reviewReply?.comment?.trim() || null,
    google_reply_updated_at: review.reviewReply?.updateTime ?? null,
  };
}

export function initialStatus(review: GbpReview, now: Date): "new" | "backlog" | "replied_elsewhere" {
  if (review.reviewReply?.comment?.trim()) return "replied_elsewhere";
  const created = review.createTime ? Date.parse(review.createTime) : Number.NaN;
  if (Number.isFinite(created) && now.getTime() - created > NOTIFY_WINDOW_DAYS * 86_400_000) {
    return "backlog";
  }
  return "new";
}

type ReviewFields = ReturnType<typeof reviewFields>;

function changedFields(row: GoogleReviewRow, fields: ReviewFields): Partial<ReviewFields> | null {
  const patch: Partial<ReviewFields> = {};
  const keys = [
    "star_rating",
    "comment",
    "reviewer_name",
    "reviewer_is_anonymous",
    "review_updated_at",
    "google_reply",
    "google_reply_updated_at",
  ] as const;
  for (const key of keys) {
    const before = row[key];
    const after = fields[key];
    const same =
      key.endsWith("_at") && before && after
        ? Date.parse(String(before)) === Date.parse(String(after))
        : before === after;
    if (!same) (patch as Record<string, unknown>)[key] = after;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Asks Claude for a draft of the reply type the row's rating calls for and
 * stores it, guarded on the draft version it replaces. With "withdraw", a
 * failed draft also clears the old one: it was written for a different rating,
 * and a thank-you must never be one tap from posting under a 1★ review.
 */
async function writeClaudeDraft(
  row: GoogleReviewRow,
  draft: typeof draftReviewReply,
  onFailure: "keep" | "withdraw",
): Promise<GoogleReviewRow> {
  const result = await draft({
    starRating: row.star_rating,
    comment: row.comment,
    reviewerName: row.reviewer_name,
    reviewerIsAnonymous: row.reviewer_is_anonymous,
  });
  const patch = result.ok
    ? {
        draft_reply: result.reply,
        draft_source: "claude" as const,
        draft_version: row.draft_version + 1,
        draft_error: null,
      }
    : onFailure === "withdraw"
      ? {
          draft_reply: null,
          draft_source: null,
          draft_version: row.draft_version + 1,
          draft_error: `the rating changed, so the earlier draft was withdrawn (${result.error})`,
        }
      : { draft_error: result.error };
  const { data } = await supabaseAdmin()
    .from("google_reviews")
    .update(patch)
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("draft_version", row.draft_version)
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  return (data as GoogleReviewRow | null) ?? row;
}

/**
 * Drafts (if needed) and posts the card for one row. Claims a `new` row first
 * so concurrent runs cannot both send it. Returns true when a card went out.
 */
export async function deliverGoogleReviewCard(
  row: GoogleReviewRow,
  deps: Pick<ReviewSyncDeps, "draft" | "send"> = {},
): Promise<boolean> {
  const admin = supabaseAdmin();
  const draft = deps.draft ?? draftReviewReply;
  const send = deps.send ?? sendGroupCard;
  let current = row;

  if (current.status === "new") {
    const { data: claimed } = await admin
      .from("google_reviews")
      .update({ status: "pending" })
      .eq("id", current.id)
      .eq("status", "new")
      .select(GOOGLE_REVIEW_COLUMNS)
      .maybeSingle();
    if (!claimed) return false;
    current = claimed as GoogleReviewRow;
  }

  if (!current.draft_reply) current = await writeClaudeDraft(current, draft, "keep");

  const card = renderGoogleReviewCard(current);
  const sent = await send(card.text, card.replyMarkup);
  // Left pending with no message id: the next run past STALE_MS retries it.
  if (!sent) return false;
  await admin
    .from("google_reviews")
    .update({ telegram_chat_id: sent.chatId, telegram_message_id: sent.messageId })
    .eq("id", current.id);
  return true;
}

async function refreshCard(row: GoogleReviewRow, edit: typeof editGroupCard): Promise<void> {
  if (!row.telegram_message_id) return;
  const card = renderGoogleReviewCard(row);
  await edit(row.telegram_message_id, card.text, card.replyMarkup);
}

export async function syncGoogleReviews(deps: ReviewSyncDeps = {}): Promise<ReviewSyncSummary> {
  const now = deps.now ?? new Date();
  const edit = deps.edit ?? editGroupCard;
  const draft = deps.draft ?? draftReviewReply;
  const summary: ReviewSyncSummary = {
    ok: true,
    fetched: 0,
    inserted: 0,
    backlog: 0,
    updated: 0,
    repliedElsewhere: 0,
    redrafted: 0,
    recovered: 0,
    carded: 0,
  };

  const config = deps.client && deps.location ? null : getBusinessProfileConfig();
  const client = deps.client ?? (config ? businessProfileClientFromConfig(config) : null);
  const location = deps.location ?? config?.location;
  if (!client || !location) return { ...summary, skipped: "not_configured" };

  const admin = supabaseAdmin();
  const page = await client.listReviews(location, { pageSize: 50 });
  const reviews = page.reviews.filter((r) => isReviewName(r.name));
  summary.fetched = reviews.length;

  const existing = new Map<string, GoogleReviewRow>();
  if (reviews.length) {
    const { data, error } = await admin
      .from("google_reviews")
      .select(GOOGLE_REVIEW_COLUMNS)
      .in(
        "review_name",
        reviews.map((r) => r.name),
      );
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as GoogleReviewRow[]) existing.set(row.review_name, row);
  }

  for (const review of reviews) {
    const fields = reviewFields(review);
    const row = existing.get(review.name);

    if (!row) {
      const status = initialStatus(review, now);
      const { data: inserted, error } = await admin
        .from("google_reviews")
        .upsert({ ...fields, status }, { onConflict: "review_name", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      if (inserted?.length) {
        summary.inserted += 1;
        if (status === "backlog") summary.backlog += 1;
      }
      continue;
    }

    const patch = changedFields(row, fields);
    if (!patch) continue;
    const next: Record<string, unknown> = { ...patch };
    // Somebody answered on Google directly while the card was waiting.
    const answeredElsewhere =
      row.status === "pending" && !!fields.google_reply && fields.google_reply !== row.posted_reply;
    if (answeredElsewhere) next.status = "replied_elsewhere";

    const { data: updated, error } = await admin
      .from("google_reviews")
      .update(next)
      .eq("id", row.id)
      .select(GOOGLE_REVIEW_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    summary.updated += 1;
    if (answeredElsewhere) summary.repliedElsewhere += 1;

    let current = updated as GoogleReviewRow | null;
    // The reviewer moved the rating into another reply type (say 5★ → 2★):
    // Claude's draft no longer fits. A review manager's own wording stays —
    // the card's service-recovery banner tells them to reconsider it.
    const restyled =
      current?.status === "pending" &&
      current.draft_source !== "staff" &&
      replyStyleFor(row.star_rating) !== replyStyleFor(current.star_rating);
    if (current && restyled) {
      current = await writeClaudeDraft(current, draft, "withdraw");
      summary.redrafted += 1;
    }
    // An open card shows the reviewer's edit (or that it was answered elsewhere).
    if (current && row.status === "pending") await refreshCard(current, edit);
  }

  // A Post that died mid-flight: hand the card back so someone can tap again.
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();
  const { data: stuck } = await admin
    .from("google_reviews")
    .update({ status: "pending", last_error: "Posting was interrupted — tap Post reply again." })
    .eq("status", "posting")
    .lt("updated_at", staleBefore)
    .select(GOOGLE_REVIEW_COLUMNS);
  for (const row of (stuck ?? []) as GoogleReviewRow[]) {
    summary.recovered += 1;
    await refreshCard(row, edit);
  }

  summary.carded = await deliverPendingCards({ ...deps, now });
  return summary;
}

/** New rows, oldest first, then claimed rows whose card never went out. */
export async function deliverPendingCards(deps: ReviewSyncDeps = {}): Promise<number> {
  const now = deps.now ?? new Date();
  const maxCards = deps.maxCards ?? DEFAULT_MAX_CARDS;
  const admin = supabaseAdmin();

  const { data: fresh } = await admin
    .from("google_reviews")
    .select(GOOGLE_REVIEW_COLUMNS)
    .eq("status", "new")
    .order("review_created_at", { ascending: true })
    .limit(maxCards);
  const { data: orphaned } = await admin
    .from("google_reviews")
    .select(GOOGLE_REVIEW_COLUMNS)
    .eq("status", "pending")
    .is("telegram_message_id", null)
    .lt("updated_at", new Date(now.getTime() - STALE_MS).toISOString())
    .limit(maxCards);

  const queue = [...((fresh ?? []) as GoogleReviewRow[]), ...((orphaned ?? []) as GoogleReviewRow[])].slice(
    0,
    maxCards,
  );
  let carded = 0;
  for (const row of queue) {
    if (await deliverGoogleReviewCard(row, deps)) carded += 1;
  }
  return carded;
}
