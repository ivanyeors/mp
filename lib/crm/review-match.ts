const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_MATCH_RULES = {
  askedWithinDays: 45,
  deliveredWithinDays: 90,
  clickWithinDays: 3,
  maxSuggestions: 3,
} as const;

const SEPARATORS = /[\s.,;:!?'"’‘“”()[\]{}/\\|&+_*@#~-]+/g;

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

export type MatchReview = {
  id: string;
  reviewerName: string | null;
  reviewerIsAnonymous: boolean;
  at: string;
};

export type MatchCandidate = {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  askedAt: string | null;
  clickedAt: string | null;
  deliveredAt: string | null;
  rejected: boolean;
  linkedElsewhere: boolean;
};

export type GoogleReviewSuggestion = {
  customerId: string;
  match: NameMatch;
  askedDaysBefore: number | null;
  deliveredDaysBefore: number | null;
  clickedDaysBefore: number | null;
  reason: string;
};

function daysBefore(event: string | null, at: number, days: number): number | null {
  if (!event) return null;
  const t = Date.parse(event);
  if (!Number.isFinite(t) || t > at || t < at - days * DAY_MS) return null;
  return Math.floor((at - t) / DAY_MS);
}

const dayWord = (n: number, what: string) =>
  n === 0 ? `${what} the same day` : `${what} ${n} ${n === 1 ? "day" : "days"} before`;

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
