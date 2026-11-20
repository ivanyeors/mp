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

export const NOTIFY_WINDOW_DAYS = 14;
export const DEFAULT_MAX_CARDS = 10;
const STALE_MS = 10 * 60 * 1000;
const EDITED_AFTER_REPLY_MS = 60_000;
const REOPENABLE: GoogleReviewStatus[] = ["posted", "skipped", "replied_elsewhere", "backlog"];
const ADOPT_TOLERANCE_MS = 2 * 60_000;

export type SyncReview = GbpReview & { mapsUri?: string | null };

export type ReviewLister = {
  listReviews(location: string, opts?: { pageSize?: number }): Promise<{ reviews: SyncReview[] }>;
};

export type ReviewSyncDeps = {
  client?: ReviewLister;
  location?: string;
  source?: GoogleReviewSource;
  now?: Date;
  maxCards?: number;
  draft?: typeof draftReviewReply;
  send?: typeof sendGroupCard;
  edit?: typeof editGroupCard;
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
  redrafted: number;
  reopened: number;
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
      if (adopted?.status === "pending") await refreshCard(adopted, edit, matchLink);
      continue;
    }
    const next: Record<string, unknown> = { ...patch };
    const restyled = replyStyleFor(row.star_rating) !== replyStyleFor(fields.star_rating);
    const answeredElsewhere =
      row.status === "pending" &&
      !!fields.google_reply &&
      fields.google_reply !== row.google_reply &&
      fields.google_reply !== row.posted_reply;
    if (answeredElsewhere) next.status = "replied_elsewhere";
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
    if (!updated) continue;
    summary.updated += 1;
    if (answeredElsewhere) summary.repliedElsewhere += 1;

    if (reopen) {
      summary.reopened += 1;
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
    if (current.status === "pending" && restyled && current.draft_source !== "staff") {
      current = await writeClaudeDraft(current, draft, "withdraw");
      summary.redrafted += 1;
    }
    if (row.status === "pending") await refreshCard(current, edit, matchLink);
  }

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
