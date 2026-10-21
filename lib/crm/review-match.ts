/**
 * Suggesting which Customer wrote a Google review (PRD customer-crm slice 12,
 * ADR 0027 (k)). Pure: the candidates come from
 * `google_review_match_candidates()` (20261020134000) through
 * ./google-review-match-server, and this decides.
 *
 * Google gives a review a display name, a photo and an anonymous flag, never
 * an email. A name is not an identity: two customers share one, and *"Jane
 * T."* or a nickname may match nobody, or the wrong person. So this only ever
 * suggests, and a Staff member confirms (*Link*) or rejects (*Not them*). No
 * code path links a review on its own (README, seventh hazard).
 *
 *  - **Candidates.** Customers sent a Review request within 45 days before the
 *    review, and Customers with an Order delivered within 90 days before it.
 *  - **Names**, normalised by {@link nameTokens} (case, accents, spacing and
 *    punctuation), strongest first:
 *      1. the full name is equal, in either order (*Tan Mei Ling* is *Mei
 *         Ling Tan*);
 *      2. the first name and the last name's initial (*Jane T.*);
 *      3. the first name alone, and only when exactly one candidate has it.
 *  - **Timing.** A review-link click within 3 days before the review
 *    strengthens a candidate; it is a hint (mail scanners prefetch links).
 *    Without a name match, timing alone never suggests anyone.
 *  - **Never suggested:** an anonymous reviewer, a pair Staff rejected, or a
 *    Customer already linked to another review (one review per Google account).
 *  - At most three suggestions, each with its reason.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_MATCH_RULES = {
  /** A Review request sent at most this many days before the review. */
  askedWithinDays: 45,
  /** An Order delivered at most this many days before the review. */
  deliveredWithinDays: 90,
  /** A review-link click at most this many days before the review strengthens. */
  clickWithinDays: 3,
  maxSuggestions: 3,
} as const;

// ─── Names ───────────────────────────────────────────────────────────────────

/**
 * Separators: whitespace and punctuation. The same characters as
 * `crm_name_tokens()` in 20261020134000_customer_google_reviews.sql, which
 * prefilters candidates by a shared token: keep the two in step.
 */
const SEPARATORS = /[\s.,;:!?'"’‘“”()[\]{}/\\|&+_*@#~-]+/g;

/** A name as lower-case tokens, accents stripped: *"José  Núñez-García"* is `jose nunez garcia`. */
export function nameTokens(name: string | null | undefined): string[] {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(SEPARATORS, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

export type NameMatch = "full_name" | "first_name_initial" | "first_name";

const NAME_STRENGTH: Record<NameMatch, number> = { full_name: 3, first_name_initial: 2, first_name: 1 };

export const NAME_MATCH_LABELS: Record<NameMatch, string> = {
  full_name: "full name",
  first_name_initial: "first name and initial",
  first_name: "first name, the only one",
};

// ─── Inputs and output ───────────────────────────────────────────────────────

export type MatchReview = {
  id: string;
  reviewerName: string | null;
  reviewerIsAnonymous: boolean;
  /** The review's own date: `review_created_at`, or when we stored it. */
  at: string;
};

export type MatchCandidate = {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  /** "Asked on": the earlier send of their Review request, either channel. */
  askedAt: string | null;
  /** The first click on their review link. A hint, never proof. */
  clickedAt: string | null;
  /** Their latest delivery at or before the review. */
  deliveredAt: string | null;
  /** Staff said *Not them* for this review. */
  rejected: boolean;
  /** Already linked to another Google review. */
  linkedElsewhere: boolean;
};

export type GoogleReviewSuggestion = {
  customerId: string;
  match: NameMatch;
  /** Whole days between the event and the review; null when it did not happen in its window. */
  askedDaysBefore: number | null;
  deliveredDaysBefore: number | null;
  clickedDaysBefore: number | null;
  /** *"full name; asked 9 days before; link clicked 1 day before"*. */
  reason: string;
};

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Days from `event` to `at` when `event` falls in `[at − days, at]`, else null. */
function daysBefore(event: string | null, at: number, days: number): number | null {
  if (!event) return null;
  const t = Date.parse(event);
  if (!Number.isFinite(t) || t > at || t < at - days * DAY_MS) return null;
  return Math.floor((at - t) / DAY_MS);
}

const dayWord = (n: number, what: string) =>
  n === 0 ? `${what} the same day` : `${what} ${n} ${n === 1 ? "day" : "days"} before`;

// ─── The decision ────────────────────────────────────────────────────────────

/**
 * Up to three Customers who may have written `review`, strongest first, each
 * with its reason. Empty for an anonymous or unnamed reviewer.
 *
 * A first name is unique only among every candidate in the windows, including
 * those rejected or linked elsewhere: a name two people share stays ambiguous
 * after Staff rule one of them out, so the other is not suggested on it alone.
 */
export function suggestGoogleReviewMatches(
  review: MatchReview,
  candidates: readonly MatchCandidate[],
): GoogleReviewSuggestion[] {
  const reviewer = nameTokens(review.reviewerName);
  const at = Date.parse(review.at);
  if (review.reviewerIsAnonymous || reviewer.length === 0 || !Number.isFinite(at)) return [];

  const R = REVIEW_MATCH_RULES;
  const inWindow = candidates
    .map((c) => ({
      c,
      asked: daysBefore(c.askedAt, at, R.askedWithinDays),
      delivered: daysBefore(c.deliveredAt, at, R.deliveredWithinDays),
      clicked: c.askedAt ? daysBefore(c.clickedAt, at, R.clickWithinDays) : null,
      first: nameTokens(c.firstName),
      last: nameTokens(c.lastName),
    }))
    .filter((x) => x.asked !== null || x.delivered !== null);

  // One entry per Customer, should the same one arrive twice.
  const seen = new Set<string>();
  const unique = inWindow.filter((x) => !seen.has(x.c.customerId) && seen.add(x.c.customerId));
  const sharingFirstName = unique.filter((x) => x.first.length > 0 && same(x.first, reviewer)).length;

  const matched: Array<{ suggestion: GoogleReviewSuggestion; rank: number[] }> = [];
  for (const x of unique) {
    if (x.c.rejected || x.c.linkedElsewhere) continue;
    const match = nameMatch(reviewer, x.first, x.last, sharingFirstName);
    if (!match) continue;
    const parts = [
      NAME_MATCH_LABELS[match],
      x.asked !== null ? dayWord(x.asked, "asked") : null,
      x.asked === null && x.delivered !== null ? dayWord(x.delivered, "delivered") : null,
      x.clicked !== null ? dayWord(x.clicked, "link clicked") : null,
    ].filter((p): p is string => p !== null);
    matched.push({
      suggestion: {
        customerId: x.c.customerId,
        match,
        askedDaysBefore: x.asked,
        deliveredDaysBefore: x.delivered,
        clickedDaysBefore: x.clicked,
        reason: parts.join("; "),
      },
      // Name first; then a click shortly before; then being asked; then the nearest event.
      rank: [
        NAME_STRENGTH[match],
        x.clicked !== null ? 1 : 0,
        x.asked !== null ? 1 : 0,
        -Math.min(x.asked ?? Infinity, x.delivered ?? Infinity),
      ],
    });
  }

  return matched
    .sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i];
      return a.suggestion.customerId.localeCompare(b.suggestion.customerId);
    })
    .slice(0, R.maxSuggestions)
    .map((m) => m.suggestion);
}

function nameMatch(
  reviewer: readonly string[],
  first: readonly string[],
  last: readonly string[],
  sharingFirstName: number,
): NameMatch | null {
  if (first.length === 0) return null;
  if (last.length > 0 && (same(reviewer, [...first, ...last]) || same(reviewer, [...last, ...first]))) {
    return "full_name";
  }
  const initial = reviewer.at(-1) ?? "";
  if (
    last.length > 0 &&
    reviewer.length === first.length + 1 &&
    initial.length === 1 &&
    same(reviewer.slice(0, first.length), first) &&
    last[0].startsWith(initial)
  ) {
    return "first_name_initial";
  }
  if (same(reviewer, first) && sharingFirstName === 1) return "first_name";
  return null;
}
