/**
 * Reviews on every Customer (PRD customer-crm slice 12): the reads. Which
 * unlinked Google reviews have a suggested Customer, the Customers page's
 * Reviews tab, the Customer detail's Reviews card, and the counts the
 * Aftercare card and Telegram show.
 *
 * Read-only: nothing here links a review (README, seventh hazard). Linking,
 * unlinking and *Not them* are ./google-review-links, called only from the
 * routes that check `customers-edit`. The Google sync may import this file
 * (for the Telegram card's *Possible customer match* line) and never that one.
 *
 * Suggestions are computed when read: `google_review_match_candidates()`
 * (20261020134000) finds who could have written each review by timing,
 * prefiltered to a shared name token, and `suggestGoogleReviewMatches`
 * decides. Callers authorise (`customers`); the service role reads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { REVIEW_REQUEST_TEMPLATE } from "@/lib/aftercare/review-request";
import { productTitle } from "@/lib/reviews/shop-reviews";
import { suggestGoogleReviewMatches, type MatchCandidate } from "@/lib/crm/review-match";
import {
  excerpt,
  googleReplyState,
  type CustomerReviewsData,
  type GoogleReviewSummary,
  type LinkedGoogleReview,
  type ReviewRequestSummary,
  type ReviewSuggestionView,
  type ReviewTabData,
  type ReviewTabScope,
  type ReviewToMatch,
  type ShopReviewSummary,
} from "@/lib/crm/reviews";
import { TELEGRAM_UPDATE_LINKS } from "@/lib/crm/telegram-updates";

/** PostgREST answers at most this many rows a request; longer reads are paged. */
const PAGE_ROWS = 1000;
/** Review ids per candidate call. */
const ID_BATCH = 100;

/** One row of `google_review_match_candidates()`. */
type CandidateRow = {
  google_review_id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  asked_at: string | null;
  clicked_at: string | null;
  delivered_at: string | null;
  rejected: boolean;
  linked_elsewhere: boolean;
};

/** One row of `admin_google_reviews_unlinked`. */
type UnlinkedRow = {
  id: string;
  star_rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  reviewer_is_anonymous: boolean;
  reviewed_at: string;
  status: string;
  has_google_reply: boolean;
};

const UNLINKED_SELECT =
  "id, star_rating, comment, reviewer_name, reviewer_is_anonymous, reviewed_at, status, has_google_reply";

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row of an ordered read, a page at a time, so none is dropped at PostgREST's row limit. */
async function readAll<T>(label: string, page: (from: number, to: number) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE_ROWS) return out;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const displayName = (first: string | null, last: string | null) =>
  [first, last].filter((p) => p?.trim()).join(" ") || null;

/** A review as the Reviews tab and card show it. */
export function summarizeGoogleReview(row: UnlinkedRow): GoogleReviewSummary {
  return {
    id: row.id,
    rating: row.star_rating,
    reviewerName: row.reviewer_is_anonymous ? null : row.reviewer_name?.trim() || null,
    reviewedAt: row.reviewed_at,
    excerpt: excerpt(row.comment),
    reply: googleReplyState(row.status, row.has_google_reply),
  };
}

// ─── Candidates and suggestions ──────────────────────────────────────────────

/** The candidate rows, grouped by review. `reviewIds` null: every unlinked review. */
async function loadCandidates(
  admin: SupabaseClient,
  opts: { reviewIds?: readonly string[]; customerId?: string },
): Promise<Map<string, CandidateRow[]>> {
  const calls = opts.reviewIds ? chunks(opts.reviewIds, ID_BATCH) : [null];
  const rows: CandidateRow[] = [];
  for (const ids of calls) {
    if (ids && ids.length === 0) continue;
    rows.push(
      ...(await readAll<CandidateRow>("google_review_match_candidates", (from, to) =>
        admin
          .rpc("google_review_match_candidates", {
            p_review_ids: ids,
            p_customer_id: opts.customerId ?? null,
          })
          .order("google_review_id")
          .order("customer_id")
          .range(from, to),
      )),
    );
  }
  const byReview = new Map<string, CandidateRow[]>();
  for (const row of rows) byReview.set(row.google_review_id, [...(byReview.get(row.google_review_id) ?? []), row]);
  return byReview;
}

async function loadUnlinked(admin: SupabaseClient, ids: readonly string[]): Promise<UnlinkedRow[]> {
  const out: UnlinkedRow[] = [];
  for (const batch of chunks(ids, ID_BATCH)) {
    const { data, error } = await admin.from("admin_google_reviews_unlinked").select(UNLINKED_SELECT).in("id", batch);
    if (error) throw new Error(`admin_google_reviews_unlinked: ${error.message}`);
    out.push(...((data ?? []) as UnlinkedRow[]));
  }
  return out;
}

const toCandidate = (r: CandidateRow): MatchCandidate => ({
  customerId: r.customer_id,
  firstName: r.first_name,
  lastName: r.last_name,
  askedAt: r.asked_at,
  clickedAt: r.clicked_at,
  deliveredAt: r.delivered_at,
  rejected: r.rejected,
  linkedElsewhere: r.linked_elsewhere,
});

/** Each review with its suggestions, those with none left out, newest first. */
function suggest(reviews: readonly UnlinkedRow[], candidates: Map<string, CandidateRow[]>): ReviewToMatch[] {
  const out: ReviewToMatch[] = [];
  for (const row of reviews) {
    const rows = candidates.get(row.id) ?? [];
    const byCustomer = new Map(rows.map((r) => [r.customer_id, r]));
    const suggestions = suggestGoogleReviewMatches(
      { id: row.id, reviewerName: row.reviewer_name, reviewerIsAnonymous: row.reviewer_is_anonymous, at: row.reviewed_at },
      rows.map(toCandidate),
    ).map((s): ReviewSuggestionView => {
      const c = byCustomer.get(s.customerId)!;
      return { customerId: s.customerId, name: displayName(c.first_name, c.last_name), email: c.email, reason: s.reason };
    });
    if (suggestions.length) out.push({ review: summarizeGoogleReview(row), suggestions });
  }
  return out.sort((a, b) => Date.parse(b.review.reviewedAt) - Date.parse(a.review.reviewedAt) || a.review.id.localeCompare(b.review.id));
}

/**
 * *Google reviews to match*: every unlinked review with at least one
 * suggestion, newest first. Anonymous and unnamed reviews never have one.
 */
export async function listReviewsToMatch(admin: SupabaseClient): Promise<ReviewToMatch[]> {
  const candidates = await loadCandidates(admin, {});
  if (candidates.size === 0) return [];
  return suggest(await loadUnlinked(admin, [...candidates.keys()]), candidates);
}

/** How many reviews wait in *Google reviews to match*: the daily Telegram update's count. */
export async function countReviewsToMatch(admin: SupabaseClient): Promise<number> {
  return (await listReviewsToMatch(admin)).length;
}

/** The suggestions for one unlinked review; empty once it is linked. */
export async function suggestionsForReview(admin: SupabaseClient, reviewId: string): Promise<ReviewSuggestionView[]> {
  const candidates = await loadCandidates(admin, { reviewIds: [reviewId] });
  if (!candidates.has(reviewId)) return [];
  const [match] = suggest(await loadUnlinked(admin, [reviewId]), candidates);
  return match?.suggestions ?? [];
}

/**
 * The Telegram Google review card's *Possible customer match* link: the
 * Reviews tab when the review has a suggestion, else null. It names nobody
 * (README, third hazard). Never throws: a card is never held up by it.
 */
export async function possibleCustomerMatchLink(
  admin: SupabaseClient,
  reviewId: string,
  origin: string,
): Promise<string | null> {
  try {
    const suggestions = await suggestionsForReview(admin, reviewId);
    return suggestions.length ? `${origin}${TELEGRAM_UPDATE_LINKS.google_reviews_to_match}` : null;
  } catch {
    return null;
  }
}

/** {@link possibleCustomerMatchLink} with the service role and the site's origin, for the card senders. */
export async function customerMatchLinkFor(reviewId: string): Promise<string | null> {
  try {
    return await possibleCustomerMatchLink(supabaseAdmin(), reviewId, getSiteOrigin());
  } catch {
    return null;
  }
}

// ─── The Reviews tab ─────────────────────────────────────────────────────────

export const REVIEW_TAB_LIMIT = 20;

/**
 * Customers → Reviews. *To match*: the reviews with a suggestion. *All
 * unlinked*: every review no Staff member has linked, newest first, each with
 * its suggestions when it has any, so a review from someone we never asked
 * can be linked by hand.
 */
export async function readReviewTab(
  admin: SupabaseClient,
  opts: { scope: ReviewTabScope; page: number; limit?: number },
): Promise<ReviewTabData> {
  const limit = opts.limit ?? REVIEW_TAB_LIMIT;
  const page = Math.max(1, opts.page);
  const from = (page - 1) * limit;

  const [toMatch, unlinkedCount] = await Promise.all([
    listReviewsToMatch(admin),
    admin.from("admin_google_reviews_unlinked").select("id", { count: "exact", head: true }),
  ]);
  if (unlinkedCount.error) throw new Error(`admin_google_reviews_unlinked: ${unlinkedCount.error.message}`);
  const counts = { toMatch: toMatch.length, unlinked: unlinkedCount.count ?? 0 };

  if (opts.scope === "to-match") {
    return { ok: true, scope: "to-match", rows: toMatch.slice(from, from + limit), page, limit, total: toMatch.length, counts };
  }

  const { data, error } = await admin
    .from("admin_google_reviews_unlinked")
    .select(UNLINKED_SELECT)
    .order("reviewed_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + limit - 1);
  if (error) throw new Error(`admin_google_reviews_unlinked: ${error.message}`);
  const suggested = new Map(toMatch.map((m) => [m.review.id, m.suggestions]));
  const rows = ((data ?? []) as UnlinkedRow[]).map((r) => ({
    review: summarizeGoogleReview(r),
    suggestions: suggested.get(r.id) ?? [],
  }));
  return { ok: true, scope: "unlinked", rows, page, limit, total: counts.unlinked, counts };
}

// ─── The Customer detail's Reviews card ──────────────────────────────────────

type LinkRow = {
  google_review_id: string;
  how: "suggestion" | "manual";
  linked_at: string;
  linked_by: { name: string } | { name: string }[] | null;
  google_reviews: {
    id: string;
    star_rating: number | null;
    comment: string | null;
    reviewer_name: string | null;
    reviewer_is_anonymous: boolean;
    review_created_at: string | null;
    created_at: string;
    status: string;
    google_reply: string | null;
  } | null;
};

type ShopRow = {
  id: string;
  rating: number;
  status: ShopReviewSummary["status"];
  created_at: string;
  product: { slug: string | null; content: Record<string, { title?: string } | undefined> | null } | null;
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * One Customer's reviews: their Linked Google reviews (the whole review, our
 * reply state, who linked it and when), their Shop reviews, their Review
 * request (asked on, by which channel, and the link's first click), and the
 * unlinked Google reviews suggested for them.
 */
export async function readCustomerReviews(admin: SupabaseClient, customerId: string): Promise<CustomerReviewsData> {
  const ledger = (table: "customer_emails" | "customer_whatsapp") =>
    admin
      .from(table)
      .select("status, sent_at")
      .eq("customer_id", customerId)
      .eq("template", REVIEW_REQUEST_TEMPLATE)
      .eq("entity_id", customerId);

  const [links, shop, request, emails, whatsapp, possible] = await Promise.all([
    admin
      .from("customer_google_reviews")
      .select(
        "google_review_id, how, linked_at, linked_by:mp_staff!linked_by_profile_id(name), " +
          "google_reviews!inner(id, star_rating, comment, reviewer_name, reviewer_is_anonymous, review_created_at, created_at, status, google_reply)",
      )
      .eq("customer_id", customerId),
    admin
      .from("product_reviews")
      .select("id, rating, status, created_at, product:products(slug, content)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    admin
      .from("customer_review_requests")
      .select("first_clicked_at, click_count")
      .eq("customer_id", customerId)
      .maybeSingle(),
    ledger("customer_emails"),
    ledger("customer_whatsapp"),
    possibleForCustomer(admin, customerId),
  ]);
  const failed = links.error ?? shop.error ?? request.error ?? emails.error ?? whatsapp.error;
  if (failed) throw new Error(failed.message);

  const google = ((links.data ?? []) as unknown as LinkRow[])
    .filter((l) => l.google_reviews)
    .map((l): LinkedGoogleReview => {
      const g = l.google_reviews!;
      return {
        ...summarizeGoogleReview({
          id: g.id,
          star_rating: g.star_rating,
          comment: g.comment,
          reviewer_name: g.reviewer_name,
          reviewer_is_anonymous: g.reviewer_is_anonymous,
          reviewed_at: g.review_created_at ?? g.created_at,
          status: g.status,
          has_google_reply: Boolean(g.google_reply),
        }),
        comment: g.comment?.trim() || null,
        how: l.how,
        linkedAt: l.linked_at,
        linkedBy: one(l.linked_by)?.name ?? null,
      };
    })
    .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));

  const shopReviews = ((shop.data ?? []) as unknown as ShopRow[]).map(
    (r): ShopReviewSummary => ({
      id: r.id,
      rating: r.rating,
      product: productTitle(one(r.product) as Parameters<typeof productTitle>[0]),
      status: r.status,
      createdAt: r.created_at,
    }),
  );

  return {
    ok: true,
    google,
    shop: shopReviews,
    request: request.data
      ? reviewRequestSummary(
          request.data as { first_clicked_at: string | null; click_count: number },
          [
            ...((emails.data ?? []) as Send[]).map((s) => ({ ...s, channel: "email" as const })),
            ...((whatsapp.data ?? []) as Send[]).map((s) => ({ ...s, channel: "whatsapp" as const })),
          ],
        )
      : null,
    possible,
  };
}

type Send = { status: string; sent_at: string | null };

/** *Asked on* is the earlier send of the two ledgers; a claim that never went out is not asked. */
export function reviewRequestSummary(
  request: { first_clicked_at: string | null; click_count: number },
  sends: Array<Send & { channel: "email" | "whatsapp" }>,
): ReviewRequestSummary {
  const sent = sends
    .filter((s) => s.status === "sent" && s.sent_at)
    .sort((a, b) => Date.parse(a.sent_at!) - Date.parse(b.sent_at!));
  return {
    askedAt: sent[0]?.sent_at ?? null,
    channels: (["email", "whatsapp"] as const).filter((c) => sent.some((s) => s.channel === c)),
    clickedAt: request.first_clicked_at,
    clickCount: request.click_count,
  };
}

/** Unlinked reviews whose suggestions include this Customer, with the reason. */
async function possibleForCustomer(
  admin: SupabaseClient,
  customerId: string,
): Promise<CustomerReviewsData["possible"]> {
  const candidates = await loadCandidates(admin, { customerId });
  if (candidates.size === 0) return [];
  const matches = suggest(await loadUnlinked(admin, [...candidates.keys()]), candidates);
  return matches.flatMap((m) => {
    const mine = m.suggestions.find((s) => s.customerId === customerId);
    return mine ? [{ review: m.review, reason: mine.reason }] : [];
  });
}

// ─── Counts ──────────────────────────────────────────────────────────────────

/**
 * Customers we asked for a review who have a Linked Google review: the
 * Aftercare card's *Google reviews linked to a customer we asked*. A `head`
 * count on the overview; nothing that names a customer leaves here.
 */
export async function countLinkedReviewsOfAsked(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("admin_customer_overview")
    .select("id", { count: "exact", head: true })
    .not("google_reviewed_at", "is", null)
    .not("review_requested_at", "is", null);
  if (error) throw new Error(`admin_customer_overview: ${error.message}`);
  return count ?? 0;
}

/** Google reviews Staff linked in `window`: the Weekly summary's line. */
export async function countGoogleReviewsLinked(
  admin: SupabaseClient,
  window: { from: string; to: string },
): Promise<number> {
  const { count, error } = await admin
    .from("customer_google_reviews")
    .select("google_review_id", { count: "exact", head: true })
    .gte("linked_at", window.from)
    .lt("linked_at", window.to);
  if (error) throw new Error(`customer_google_reviews: ${error.message}`);
  return count ?? 0;
}
