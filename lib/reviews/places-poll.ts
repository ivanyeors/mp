import { supabaseAdmin } from "@/lib/supabase/server";
import { getBusinessProfileConfig, type GbpStarRating } from "@/lib/google/business-profile";
import {
  hasGooglePlaceReviewsConfig,
  readPlaceReviews,
  type PlaceReview,
  type PlaceReviewsRead,
} from "@/lib/google/places-reviews";
import { renderExpiredPlacesCard, renderMissedReviewsNotice } from "@/lib/reviews/cards";
import { GOOGLE_REVIEW_COLUMNS, type GoogleReviewRow } from "@/lib/reviews/google-reviews";
import {
  syncGoogleReviews,
  type ReviewSyncDeps,
  type ReviewSyncSummary,
  type SyncReview,
} from "@/lib/reviews/google-sync";
import { editGroupCard, sendGroupMessage } from "@/lib/telegram/bot-api";

/**
 * Google reviews through the Places API, until the Business Profile API is
 * approved (ADR 0035). Chained onto the daily results-sla cron, it reads only
 * once its last successful read is a week old, so a failed read is retried the
 * next day; /api/cron/google-places-reviews forces a read for ops.
 *
 * One read returns Google's five most relevant reviews — not the newest, and
 * nothing of our replies — which the review sync stores and cards like any
 * other, as source `places`: staff reply on Google Maps and tap Mark replied.
 * The place's review count rises with every review, so one that the five do
 * not show is still announced, with a link to answer it on Google Maps.
 *
 * Cost: each read is one Place Details Enterprise + Atmosphere call, 1,000 free
 * a month across the project. The landing page reads once a week too
 * (PLACE_REVIEWS_REVALIDATE_SECONDS); this poll counts its own reads per month
 * in google_places_polls and stops at the cap before calling, so a manual run
 * or a changed schedule cannot run up a bill.
 *
 * Places content may only be kept temporarily: rows from Places are deleted
 * 30 days after they are stored, and an open card then loses its buttons.
 * Once the Business Profile API is configured this poll stands down, and the
 * Business Profile sync adopts the Places rows it finds (lib/reviews/google-sync.ts).
 */

/** Google's free Place Details Enterprise + Atmosphere reads a month, for the whole project. */
export const PLACES_FREE_READS_PER_MONTH = 1000;
/** The poll's own ceiling a month. Weekly it reads 4–5 times; this only stops a runaway. */
export const DEFAULT_PLACES_POLL_CAP = 60;
/** The highest cap GOOGLE_PLACES_POLL_MONTHLY_CAP may set: half the free reads, the rest left to the landing page. */
const MAX_PLACES_POLL_CAP = PLACES_FREE_READS_PER_MONTH / 2;
/** How long Places content stays in google_reviews. */
export const PLACES_RETENTION_DAYS = 30;
/** A week, less an hour: the daily cron's start time wobbles, and a week-to-the-second gate would slip a day. */
const POLL_INTERVAL_MS = 7 * 86_400_000 - 3_600_000;

export function placesPollMonthlyCap(): number {
  const raw = Number(process.env.GOOGLE_PLACES_POLL_MONTHLY_CAP?.trim());
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_PLACES_POLL_CAP) : DEFAULT_PLACES_POLL_CAP;
}

/** The first day of `now`'s month (UTC), the poll table's key. */
export function pollMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const STARS: GbpStarRating[] = ["STAR_RATING_UNSPECIFIED", "ONE", "TWO", "THREE", "FOUR", "FIVE"];

/** A Places review in the Business Profile shape the sync reads. Places has no update time or replies. */
export function placesToSyncReview(review: PlaceReview): SyncReview {
  const stars = review.rating ? Math.max(1, Math.min(5, Math.round(review.rating))) : 0;
  return {
    name: review.name,
    starRating: STARS[stars],
    comment: review.text ?? undefined,
    reviewer: { displayName: review.authorName ?? undefined },
    createTime: review.publishTime ?? undefined,
    updateTime: review.publishTime ?? undefined,
    mapsUri: review.mapsUri,
  };
}

type Claim =
  | { ok: true; calls: number }
  | { ok: false; reason: "monthly_cap" | "busy"; calls: number };

/**
 * Counts one read against this month's cap before it is made, guarded on the
 * count it read, so two runs at once cannot both pass the last free slot. A
 * read that fails still counts: Google may bill it.
 */
async function claimPlacesRead(month: string, cap: number): Promise<Claim> {
  const admin = supabaseAdmin();
  const { error: seedError } = await admin
    .from("google_places_polls")
    .upsert({ month }, { onConflict: "month", ignoreDuplicates: true });
  if (seedError) throw new Error(seedError.message);
  const { data: row, error } = await admin.from("google_places_polls").select("calls").eq("month", month).maybeSingle();
  if (error) throw new Error(error.message);
  const calls = Number((row as { calls?: number } | null)?.calls ?? 0);
  if (calls >= cap) return { ok: false, reason: "monthly_cap", calls };
  const { data: claimed } = await admin
    .from("google_places_polls")
    .update({ calls: calls + 1 })
    .eq("month", month)
    .eq("calls", calls)
    .select("calls")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "busy", calls };
  return { ok: true, calls: calls + 1 };
}

/** When the last read succeeded, any month; null before the first. */
async function lastSuccessfulRead(): Promise<number | null> {
  const { data } = await supabaseAdmin()
    .from("google_places_polls")
    .select("last_polled_at")
    .not("last_polled_at", "is", null)
    .order("last_polled_at", { ascending: false })
    .limit(1);
  const at = Date.parse((data as { last_polled_at: string }[] | null)?.[0]?.last_polled_at ?? "");
  return Number.isFinite(at) ? at : null;
}

/** The review count at the last successful read, any month; null before the first. */
async function lastRatingCount(): Promise<number | null> {
  const { data } = await supabaseAdmin()
    .from("google_places_polls")
    .select("month,rating_count")
    .not("rating_count", "is", null)
    .order("month", { ascending: false })
    .limit(1);
  const count = (data as { rating_count: number | null }[] | null)?.[0]?.rating_count;
  return typeof count === "number" ? count : null;
}

/** Deletes Places rows past the retention window; an open card is closed first. */
export async function purgeExpiredPlacesReviews(
  now: Date,
  edit: typeof editGroupCard = editGroupCard,
): Promise<number> {
  const before = new Date(now.getTime() - PLACES_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("google_reviews")
    .delete()
    .eq("source", "places")
    .lt("created_at", before)
    .select(GOOGLE_REVIEW_COLUMNS);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GoogleReviewRow[];
  for (const row of rows) {
    if (row.status === "pending" && row.telegram_message_id) {
      await edit(row.telegram_message_id, renderExpiredPlacesCard(row));
    }
  }
  return rows.length;
}

export type PlacesPollDeps = Pick<ReviewSyncDeps, "draft" | "send" | "edit" | "matchLink" | "maxCards"> & {
  now?: Date;
  /** Read even if the last read was less than a week ago (still within the cap). */
  force?: boolean;
  read?: () => Promise<PlaceReviewsRead>;
  notify?: typeof sendGroupMessage;
};

export type PlacesPollSummary =
  | {
      ok: true;
      skipped: "business_profile" | "not_configured" | "not_due" | "monthly_cap" | "busy";
      calls?: number;
      cap: number;
      purged: number;
    }
  | {
      ok: true;
      skipped?: undefined;
      calls: number;
      cap: number;
      purged: number;
      ratingCount: number | null;
      /** New reviews on Google that the five Places returns did not include. */
      missed: number;
      sync: ReviewSyncSummary;
    }
  | { ok: false; calls: number; cap: number; purged: number; error: string };

export async function pollPlacesReviews(deps: PlacesPollDeps = {}): Promise<PlacesPollSummary> {
  const { read: readDep, notify, force, now = new Date(), ...syncDeps } = deps;
  const cap = placesPollMonthlyCap();
  // Places rows are purged even after the Business Profile API takes over.
  const purged = await purgeExpiredPlacesReviews(now, deps.edit);
  if (getBusinessProfileConfig()) return { ok: true, skipped: "business_profile", cap, purged };
  if (!hasGooglePlaceReviewsConfig()) return { ok: true, skipped: "not_configured", cap, purged };
  const last = force ? null : await lastSuccessfulRead();
  if (last !== null && now.getTime() - last < POLL_INTERVAL_MS) return { ok: true, skipped: "not_due", cap, purged };

  const month = pollMonth(now);
  const claim = await claimPlacesRead(month, cap);
  if (!claim.ok) return { ok: true, skipped: claim.reason, calls: claim.calls, cap, purged };

  const admin = supabaseAdmin();
  const read = await (readDep ?? readPlaceReviews)();
  if (!read.ok) {
    await admin.from("google_places_polls").update({ last_error: read.error }).eq("month", month);
    return { ok: false, calls: claim.calls, cap, purged, error: read.error };
  }

  const previousCount = await lastRatingCount();
  const reviews = read.reviews.map(placesToSyncReview);
  const sync = await syncGoogleReviews({
    ...syncDeps,
    now,
    source: "places",
    location: `places/${process.env.GOOGLE_PLACE_ID?.trim() ?? ""}`,
    client: { listReviews: async () => ({ reviews }) },
  });

  // Reviews that are new to us and recent; an old one Google just started showing is not news.
  const freshlySeen = sync.inserted - sync.backlog;
  const missed =
    previousCount !== null && read.ratingCount !== null
      ? Math.max(0, read.ratingCount - previousCount - freshlySeen)
      : 0;
  if (missed > 0) await (notify ?? sendGroupMessage)(renderMissedReviewsNotice(missed, read.mapsUri));

  await admin
    .from("google_places_polls")
    .update({ rating_count: read.ratingCount, last_polled_at: now.toISOString(), last_error: null })
    .eq("month", month);
  return { ok: true, calls: claim.calls, cap, purged, ratingCount: read.ratingCount, missed, sync };
}

export type PlacesPollStatus = {
  /** Polling now: Places is configured and the Business Profile API is not. */
  active: boolean;
  configured: boolean;
  cap: number;
  callsThisMonth: number;
  lastPolledAt: string | null;
  lastError: string | null;
};

/** For Users & permissions → Telegram. Reads the poll table only: a billed Places read is never spent on a status check. */
export async function getPlacesPollStatus(now = new Date()): Promise<PlacesPollStatus> {
  const configured = hasGooglePlaceReviewsConfig();
  const { data } = await supabaseAdmin()
    .from("google_places_polls")
    .select("calls,last_polled_at,last_error")
    .eq("month", pollMonth(now))
    .maybeSingle();
  const row = data as { calls: number; last_polled_at: string | null; last_error: string | null } | null;
  return {
    active: configured && !getBusinessProfileConfig(),
    configured,
    cap: placesPollMonthlyCap(),
    callsThisMonth: row?.calls ?? 0,
    lastPolledAt: row?.last_polled_at ?? null,
    lastError: row?.last_error ?? null,
  };
}
