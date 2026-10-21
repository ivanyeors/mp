/**
 * Reviews on every Customer (PRD customer-crm slice 12): the shapes the
 * Customers page's Reviews tab and the Customer detail's Reviews card read,
 * and their wording. Type-only and pure, so the Admin Panel's browser code
 * shares them; the reads are in ./google-review-match-server.
 *
 * What ties a review to a Customer, and how surely:
 *  - a **Shop review** (`product_reviews.customer_id`): exactly;
 *  - the **Review request** (CRM slice 07): exactly for *asked on*; its first
 *    click is a hint, because mail scanners prefetch links;
 *  - a **Google review**: never by itself. A **Linked Google review** is one
 *    Staff confirmed (ADR 0028 (k)).
 */

import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";

// ─── Dates ───────────────────────────────────────────────────────────────────

const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** *3 Nov*, in Singapore. */
export function reviewShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : shortDate.format(d);
}

/** *3 Nov 2026*, in Singapore. */
export function reviewDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fullDate.format(d);
}

/** *★5*, or *★–* when Google gave no rating. */
export const stars = (rating: number | null | undefined) => (rating ? `★${rating}` : "★–");

// ─── The Review column (the Customers list) ──────────────────────────────────

type ReviewColumns = Pick<
  CustomerOverviewRow,
  | "review_requested_at"
  | "review_link_clicked_at"
  | "google_review_rating"
  | "google_reviewed_at"
  | "shop_reviews_count"
  | "shop_review_avg_rating"
>;

/**
 * The Review column's facts, strongest first: *★5 Google*, *★4 shop (2)*,
 * *Asked 3 Nov · clicked*, *Asked 3 Nov*. Empty for *—*. The shop's stars are
 * its average rounded to whole stars, as the view rounds it into
 * `review_rating` for the Rating filter.
 */
export function reviewFacts(row: ReviewColumns): string[] {
  const facts: string[] = [];
  if (row.google_reviewed_at) facts.push(`${stars(row.google_review_rating)} Google`);
  if (row.shop_reviews_count > 0) {
    facts.push(`${stars(Math.round(Number(row.shop_review_avg_rating)))} shop (${row.shop_reviews_count})`);
  }
  if (row.review_requested_at) {
    facts.push(`Asked ${reviewShortDate(row.review_requested_at)}${row.review_link_clicked_at ? " · clicked" : ""}`);
  }
  return facts;
}

// ─── Google reviews ──────────────────────────────────────────────────────────

/** Whether we have answered on Google, from `google_reviews.status` and the reply Google reports. */
export type GoogleReplyState = "replied" | "answered_elsewhere" | "skipped" | "waiting";

export function googleReplyState(status: string, hasGoogleReply: boolean): GoogleReplyState {
  if (status === "posted") return "replied";
  if (status === "replied_elsewhere") return "answered_elsewhere";
  if (status === "skipped") return hasGoogleReply ? "answered_elsewhere" : "skipped";
  return hasGoogleReply ? "answered_elsewhere" : "waiting";
}

export const GOOGLE_REPLY_LABELS: Record<GoogleReplyState, string> = {
  replied: "We replied on Google",
  answered_elsewhere: "Answered on Google",
  skipped: "Skipped, no reply",
  waiting: "Not replied yet",
};

/** A Google review as the Reviews tab and card show it. Anonymous reviewers have no name. */
export type GoogleReviewSummary = {
  id: string;
  rating: number | null;
  /** Null for an anonymous or unnamed reviewer: *A Google user*. */
  reviewerName: string | null;
  reviewedAt: string;
  /** The first 200 characters; null for a rating with no text. */
  excerpt: string | null;
  reply: GoogleReplyState;
};

export const reviewerLabel = (r: Pick<GoogleReviewSummary, "reviewerName">) => r.reviewerName ?? "A Google user";

export const EXCERPT_CHARS = 200;

export function excerpt(text: string | null | undefined, max = EXCERPT_CHARS): string | null {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A suggested Customer, with who they are and why. */
export type ReviewSuggestionView = {
  customerId: string;
  name: string | null;
  email: string | null;
  /** *"full name; asked 9 days before; link clicked 1 day before"*. */
  reason: string;
};

export type ReviewToMatch = { review: GoogleReviewSummary; suggestions: ReviewSuggestionView[] };

/**
 * The Reviews tab's two lists: *To match*, the reviews with at least one
 * suggestion (what the daily Telegram update counts), and *All unlinked*,
 * every review no Staff member has linked, newest first.
 */
export const REVIEW_TAB_SCOPES = ["to-match", "unlinked"] as const;
export type ReviewTabScope = (typeof REVIEW_TAB_SCOPES)[number];

export function parseReviewTabScope(value: string | null | undefined): ReviewTabScope {
  return value === "unlinked" ? "unlinked" : "to-match";
}

export type ReviewTabData = {
  ok: true;
  scope: ReviewTabScope;
  rows: ReviewToMatch[];
  page: number;
  limit: number;
  /** Rows in this scope. */
  total: number;
  counts: { toMatch: number; unlinked: number };
};

// ─── The Customer detail's Reviews card ──────────────────────────────────────

export type LinkedGoogleReview = GoogleReviewSummary & {
  /** The whole review. */
  comment: string | null;
  how: "suggestion" | "manual";
  linkedAt: string;
  /** The Staff profile that linked it; null when nobody had chosen one, or it is gone. */
  linkedBy: string | null;
};

export type ShopReviewSummary = {
  id: string;
  rating: number;
  product: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type ReviewRequestSummary = {
  /** "Asked on": the earlier send, either channel; null while nothing went out. */
  askedAt: string | null;
  channels: Array<"email" | "whatsapp">;
  clickedAt: string | null;
  clickCount: number;
};

export type CustomerReviewsData = {
  ok: true;
  google: LinkedGoogleReview[];
  shop: ShopReviewSummary[];
  /** Null when they were never asked. */
  request: ReviewRequestSummary | null;
  /** Unlinked Google reviews this Customer may have written, with the reason. */
  possible: Array<{ review: GoogleReviewSummary; reason: string }>;
};

/** A link refused because the review is linked already: who holds it. */
export type CurrentGoogleReviewLink = {
  customerId: string;
  name: string | null;
  email: string | null;
  linkedAt: string;
};
