import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";

const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function reviewShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : shortDate.format(d);
}

export function reviewDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fullDate.format(d);
}

export const stars = (rating: number | null | undefined) => (rating ? `★${rating}` : "★–");

type ReviewColumns = Pick<
  CustomerOverviewRow,
  | "review_requested_at"
  | "review_link_clicked_at"
  | "google_review_rating"
  | "google_reviewed_at"
  | "shop_reviews_count"
  | "shop_review_avg_rating"
>;

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

export type GoogleReviewSummary = {
  id: string;
  rating: number | null;
  reviewerName: string | null;
  reviewedAt: string;
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

export type ReviewSuggestionView = {
  customerId: string;
  name: string | null;
  email: string | null;
  reason: string;
};

export type ReviewToMatch = { review: GoogleReviewSummary; suggestions: ReviewSuggestionView[] };

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
  total: number;
  counts: { toMatch: number; unlinked: number };
};

export type LinkedGoogleReview = GoogleReviewSummary & {
  comment: string | null;
  how: "suggestion" | "manual";
  linkedAt: string;
  linkedBy: string | null;
  answer: GoogleReviewAnswer;
};

export type GoogleReviewAnswer = {
  draft: string | null;
  posted: string | null;
  url: string | null;
  urlIsReview: boolean;
  canMarkReplied: boolean;
};

export type ShopReviewSummary = {
  id: string;
  rating: number;
  product: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type ReviewRequestSummary = {
  askedAt: string | null;
  channels: Array<"email" | "whatsapp">;
  clickedAt: string | null;
  clickCount: number;
};

export type CustomerReviewsData = {
  ok: true;
  google: LinkedGoogleReview[];
  shop: ShopReviewSummary[];
  request: ReviewRequestSummary | null;
  possible: Array<{ review: GoogleReviewSummary; reason: string }>;
};

export type CurrentGoogleReviewLink = {
  customerId: string;
  name: string | null;
  email: string | null;
  linkedAt: string;
};
