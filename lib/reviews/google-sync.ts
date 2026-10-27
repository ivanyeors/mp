import { supabaseAdmin } from "@/lib/supabase/server";
import {
  businessProfileClientFromConfig,
  getBusinessProfileConfig,
  isReviewName,
  starRatingToNumber,
  type GbpReview,
} from "@/lib/google/business-profile";
import { isPlacesReviewName } from "@/lib/google/places-reviews";
import { draftInputFor, draftReviewReply } from "@/lib/reviews/draft-reply";
import { renderGoogleReviewCard } from "@/lib/reviews/cards";
import { replyStyleFor } from "@/lib/reviews/reply-style";
import { editGroupCard, sendGroupCard } from "@/lib/telegram/bot-api";
import { customerMatchLinkFor } from "@/lib/crm/google-review-match-server";
import {
  GOOGLE_REVIEW_COLUMNS,
  type GoogleReviewRow,
  type GoogleReviewSource,
  type GoogleReviewStatus,
} from "@/lib/reviews/google-reviews";

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
 *
 * Reopening: a review that was answered, skipped, or recorded without a card
 * comes back as a fresh card when its rating moves into another reply type —
 * 5★ → 2★ needs service recovery, 2★ → 5★ deserves a thank-you. The new card
 * shows the reply on Google now, and posting replaces it.
 *
 * Two sources feed it (`source`): the Business Profile API, and until that is
 * approved, the Places API (lib/reviews/places-poll.ts), whose reviews are
 * mapped into the same shape. When the Business Profile API takes over, a
 * review already carded from Places is adopted — renamed and re-sourced, card
 * and all — so it is not carded twice.
 */

/** Reviews last changed longer ago than this when first seen get no card. */
export const NOTIFY_WINDOW_DAYS = 14;
/** Caps a first sync (or an outage catch-up) so it cannot flood the group. */
export const DEFAULT_MAX_CARDS = 10;
/** A claimed row with no card after this long is treated as a crashed send. */
const STALE_MS = 10 * 60 * 1000;
/** Slack between a reply's timestamp and the review's when Google records both. */
const EDITED_AFTER_REPLY_MS = 60_000;
/** Settled states a rating change can reopen. */
const REOPENABLE: GoogleReviewStatus[] = ["posted", "skipped", "replied_elsewhere", "backlog"];
/** How far apart Places' publish time and Business Profile's create or update time may be for one review. */
const ADOPT_TOLERANCE_MS = 2 * 60_000;

/** A review as the sync reads it: Business Profile's shape, which Places reviews are mapped into. */
export type SyncReview = GbpReview & { mapsUri?: string | null };

/** Lists the newest reviews of one source. A BusinessProfileClient is one. */
export type ReviewLister = {
  listReviews(location: string, opts?: { pageSize?: number }): Promise<{ reviews: SyncReview[] }>;
};

export type ReviewSyncDeps = {
  client?: ReviewLister;
  location?: string;
  /** Which API `client` reads. Defaults to the Business Profile API. */
  source?: GoogleReviewSource;
  now?: Date;
  maxCards?: number;
  draft?: typeof draftReviewReply;
  send?: typeof sendGroupCard;
  edit?: typeof editGroupCard;
  /**
   * CRM slice 12: the card's *Possible customer match* link, when a Customer
   * may have written the review. A read only: the sync never links a review
   * to a Customer (CRM README, seventh hazard).
   */
  matchLink?: typeof customerMatchLinkFor;
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
  /** Settled reviews back as fresh cards because their rating changed reply type. */
  reopened: number;
  /** Places rows the Business Profile API took over. */
  adopted: number;
  recovered: number;
  carded: number;
};

export function reviewFields(review: SyncReview) {
  return {
    review_name: review.name,
    maps_uri: review.mapsUri?.trim() || null,
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

export type InitialState = { status: "new" | "backlog" | "replied_elsewhere"; reopened: boolean };

/**
 * Where a review we have never stored starts. The window runs from its last
 * change, so an old review its author just edited counts as fresh. One edited
 * after it was answered gets a card too — the reply may no longer fit — though
 * its rating before the edit is unknown.
 */
export function initialState(review: GbpReview, now: Date): InitialState {
  const lastChange = Date.parse(review.updateTime ?? review.createTime ?? "");
  const fresh =
    !Number.isFinite(lastChange) || now.getTime() - lastChange <= NOTIFY_WINDOW_DAYS * 86_400_000;
  if (review.reviewReply?.comment?.trim()) {
    const repliedAt = Date.parse(review.reviewReply.updateTime ?? "");
    const editedAfterReply =
      Number.isFinite(lastChange) && Number.isFinite(repliedAt) && lastChange - repliedAt > EDITED_AFTER_REPLY_MS;
    return fresh && editedAfterReply
      ? { status: "new", reopened: true }
      : { status: "replied_elsewhere", reopened: false };
  }
  return { status: fresh ? "new" : "backlog", reopened: false };
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
  const result = await draft(draftInputFor(row));
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
  deps: Pick<ReviewSyncDeps, "draft" | "send" | "matchLink"> = {},
): Promise<boolean> {
  const admin = supabaseAdmin();
  const draft = deps.draft ?? draftReviewReply;
  const send = deps.send ?? sendGroupCard;
  const matchLink = deps.matchLink ?? customerMatchLinkFor;
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

  const card = renderGoogleReviewCard(current, { possibleCustomerMatch: await matchLink(current.id) });
  const sent = await send(card.text, card.replyMarkup);
  // Left pending with no message id: the next run past STALE_MS retries it.
  if (!sent) return false;
  await admin
    .from("google_reviews")
    .update({ telegram_chat_id: sent.chatId, telegram_message_id: sent.messageId })
    .eq("id", current.id);
  return true;
}

async function refreshCard(
  row: GoogleReviewRow,
  edit: typeof editGroupCard,
  matchLink: typeof customerMatchLinkFor,
): Promise<void> {
  if (!row.telegram_message_id) return;
  const card = renderGoogleReviewCard(row, { possibleCustomerMatch: await matchLink(row.id) });
  await edit(row.telegram_message_id, card.text, card.replyMarkup);
}

export async function syncGoogleReviews(deps: ReviewSyncDeps = {}): Promise<ReviewSyncSummary> {
  const now = deps.now ?? new Date();
  const edit = deps.edit ?? editGroupCard;
  const draft = deps.draft ?? draftReviewReply;
  const matchLink = deps.matchLink ?? customerMatchLinkFor;
  const summary: ReviewSyncSummary = {
    ok: true,
    fetched: 0,
    inserted: 0,
    backlog: 0,
    updated: 0,
    repliedElsewhere: 0,
    redrafted: 0,
    reopened: 0,
    adopted: 0,
    recovered: 0,
    carded: 0,
  };

  const source = deps.source ?? "business_profile";
  const config = deps.client && deps.location ? null : getBusinessProfileConfig();
  const client = deps.client ?? (config ? businessProfileClientFromConfig(config) : null);
  const location = deps.location ?? config?.location;
  if (!client || !location) return { ...summary, skipped: "not_configured" };

  const admin = supabaseAdmin();
  const page = await client.listReviews(location, { pageSize: 50 });
  const reviews = page.reviews.filter((r) =>
    source === "places" ? isPlacesReviewName(r.name) : isReviewName(r.name),
  );
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
  // Rows read from Places that the Business Profile API may now be reading too.
  const placesRows: GoogleReviewRow[] = [];
  if (source === "business_profile" && reviews.some((r) => !existing.has(r.name))) {
    const { data, error } = await admin
      .from("google_reviews")
      .select(GOOGLE_REVIEW_COLUMNS)
      .eq("source", "places");
    if (error) throw new Error(error.message);
    placesRows.push(...((data ?? []) as GoogleReviewRow[]));
  }

  for (const review of reviews) {
    const fields = reviewFields(review);
    let row = existing.get(review.name);
    const adopted = !row && placesRows.length > 0 ? await adoptPlacesRow(review, placesRows) : null;
    if (adopted) {
      row = adopted;
      summary.adopted += 1;
    }

    if (!row) {
      const initial = initialState(review, now);
      const { data: inserted, error } = await admin
        .from("google_reviews")
        .upsert(
          {
            ...fields,
            source,
            status: initial.status,
            ...(initial.reopened ? { reopened_at: now.toISOString() } : {}),
          },
          { onConflict: "review_name", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(error.message);
      if (inserted?.length) {
        summary.inserted += 1;
        if (initial.status === "backlog") summary.backlog += 1;
        if (initial.reopened) summary.reopened += 1;
      }
      continue;
    }

    const patch = changedFields(row, fields);
    if (!patch) {
      // An adopted card swaps Mark replied for Post reply.
      if (adopted?.status === "pending") await refreshCard(adopted, edit, matchLink);
      continue;
    }
    const next: Record<string, unknown> = { ...patch };
    // The reviewer moved the rating into another reply type (5★ → 2★, 2★ → 5★).
    const restyled = replyStyleFor(row.star_rating) !== replyStyleFor(fields.star_rating);
    // Somebody answered on Google directly while the card was waiting: a reply
    // that is new since we last looked, and not the one we posted.
    const answeredElsewhere =
      row.status === "pending" &&
      !!fields.google_reply &&
      fields.google_reply !== row.google_reply &&
      fields.google_reply !== row.posted_reply;
    if (answeredElsewhere) next.status = "replied_elsewhere";
    // A settled review whose reply type changed comes back as a fresh card: the
    // reply on Google, if any, was written for a different review.
    const reopen = !answeredElsewhere && restyled && REOPENABLE.includes(row.status);
    if (reopen) {
      Object.assign(next, {
        status: "new",
        draft_reply: null,
        draft_source: null,
        draft_version: row.draft_version + 1,
        draft_error: null,
        last_error: null,
        acted_by_telegram_user_id: null,
        acted_by_name: null,
        telegram_chat_id: null,
        telegram_message_id: null,
        reopened_at: now.toISOString(),
        reopened_from_rating: row.star_rating,
      });
    }

    const { data: updated, error } = await admin
      .from("google_reviews")
      .update(next)
      .eq("id", row.id)
      .eq("status", row.status)
      .select(GOOGLE_REVIEW_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Someone acted on the row meanwhile; the next sync sees the edit again.
    if (!updated) continue;
    summary.updated += 1;
    if (answeredElsewhere) summary.repliedElsewhere += 1;

    if (reopen) {
      summary.reopened += 1;
      // The old card keeps its history but points at the new one.
      if (row.telegram_message_id) {
        const old = renderGoogleReviewCard(row);
        await edit(
          row.telegram_message_id,
          `${old.text}\n\n🔄 Reopened in a new card below — the rating changed from ${row.star_rating ?? "?"}★ to ${fields.star_rating ?? "?"}★.`,
        );
      }
      continue;
    }

    let current = updated as GoogleReviewRow;
    // An open card's Claude draft no longer fits the new reply type. A review
    // manager's own wording stays — the card's banners prompt them to rethink it.
    if (current.status === "pending" && restyled && current.draft_source !== "staff") {
      current = await writeClaudeDraft(current, draft, "withdraw");
      summary.redrafted += 1;
    }
    // An open card shows the reviewer's edit (or that it was answered elsewhere).
    if (row.status === "pending") await refreshCard(current, edit, matchLink);
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
    await refreshCard(row, edit, matchLink);
  }

  summary.carded = await deliverPendingCards({ ...deps, now });
  return summary;
}

/**
 * The Places row for a review the Business Profile API now lists: same
 * reviewer, written at the same time. Renamed to the Business Profile name and
 * re-sourced, keeping its card, draft and status. Null when none matches (the
 * review is then stored as new).
 */
async function adoptPlacesRow(review: SyncReview, candidates: GoogleReviewRow[]): Promise<GoogleReviewRow | null> {
  const name = review.reviewer?.displayName?.trim();
  if (!name) return null;
  const times = [review.createTime, review.updateTime]
    .map((t) => Date.parse(t ?? ""))
    .filter(Number.isFinite);
  const index = candidates.findIndex((row) => {
    const published = Date.parse(row.review_created_at ?? "");
    return (
      row.reviewer_name === name &&
      Number.isFinite(published) &&
      times.some((t) => Math.abs(t - published) <= ADOPT_TOLERANCE_MS)
    );
  });
  if (index === -1) return null;
  const [candidate] = candidates.splice(index, 1);
  const { data, error } = await supabaseAdmin()
    .from("google_reviews")
    .update({ review_name: review.name, source: "business_profile" })
    .eq("id", candidate.id)
    .eq("source", "places")
    .select(GOOGLE_REVIEW_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GoogleReviewRow | null) ?? null;
}

/** New and reopened rows in the order they queued, then claimed rows whose card never went out. */
export async function deliverPendingCards(deps: ReviewSyncDeps = {}): Promise<number> {
  const now = deps.now ?? new Date();
  const maxCards = deps.maxCards ?? DEFAULT_MAX_CARDS;
  const admin = supabaseAdmin();

  const { data: fresh } = await admin
    .from("google_reviews")
    .select(GOOGLE_REVIEW_COLUMNS)
    .eq("status", "new")
    .order("updated_at", { ascending: true })
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
