import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nameTokens,
  REVIEW_MATCH_RULES,
  suggestGoogleReviewMatches,
  type MatchCandidate,
  type MatchReview,
} from "@/lib/crm/review-match";

/**
 * Suggesting who wrote a Google review (CRM slice 12, ADR 0027 (k)): a name is
 * not an identity, so the strongest a name can do is suggest, and timing alone
 * never does.
 */

const AT = "2026-11-03T02:00:00.000Z"; // 3 Nov, 10:00 SGT
const daysBefore = (n: number) => new Date(Date.parse(AT) - n * 24 * 60 * 60 * 1000).toISOString();

const review = (reviewerName: string | null, over: Partial<MatchReview> = {}): MatchReview => ({
  id: "r1",
  reviewerName,
  reviewerIsAnonymous: false,
  at: AT,
  ...over,
});

const candidate = (customerId: string, firstName: string | null, lastName: string | null, over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  customerId,
  firstName,
  lastName,
  askedAt: daysBefore(9),
  clickedAt: null,
  deliveredAt: null,
  rejected: false,
  linkedElsewhere: false,
  ...over,
});

const ids = (r: MatchReview, cs: MatchCandidate[]) => suggestGoogleReviewMatches(r, cs).map((s) => s.customerId);

describe("nameTokens", () => {
  it("normalises case, accents, spacing and punctuation", () => {
    expect(nameTokens("  José  Núñez-García ")).toEqual(["jose", "nunez", "garcia"]);
    expect(nameTokens("Jane T.")).toEqual(["jane", "t"]);
    expect(nameTokens("O'Brien, Mary (Mae)")).toEqual(["o", "brien", "mary", "mae"]);
    expect(nameTokens("ZOË")).toEqual(["zoe"]);
    expect(nameTokens("陈美玲")).toEqual(["陈美玲"]);
    expect(nameTokens(null)).toEqual([]);
    expect(nameTokens(" . ")).toEqual([]);
  });

  it("splits on the same separators as crm_name_tokens() in the migration", () => {
    const sql = readFileSync("supabase/migrations/20261020134000_customer_google_reviews.sql", "utf8");
    // The SQL class, its quote doubled; the TS one is the same characters.
    expect(sql).toContain(String.raw`'[\s.,;:!?''"’‘“”()\[\]{}/\\|&+_*@#~-]+'`);
    expect(sql).toContain(String.raw`'[̀-ͯ]'`);
  });
});

describe("suggestGoogleReviewMatches: names", () => {
  it("suggests on the full name, in either order", () => {
    const [s] = suggestGoogleReviewMatches(review("Jane Tan"), [candidate("c1", "Jane", "Tan")]);
    expect(s).toMatchObject({ customerId: "c1", match: "full_name", reason: "full name; asked 9 days before" });
    // Surname first, as many Singapore names are written.
    expect(suggestGoogleReviewMatches(review("Tan Mei Ling"), [candidate("c2", "Mei Ling", "Tan")])[0]).toMatchObject({
      match: "full_name",
    });
    // Accents and case do not matter.
    expect(ids(review("jose nunez"), [candidate("c3", "José", "Núñez")])).toEqual(["c3"]);
  });

  it("suggests on the first name and the last name's initial", () => {
    const [s] = suggestGoogleReviewMatches(review("Jane T."), [candidate("c1", "Jane", "Tan")]);
    expect(s).toMatchObject({ match: "first_name_initial", reason: "first name and initial; asked 9 days before" });
    // A different initial is not them.
    expect(ids(review("Jane L."), [candidate("c1", "Jane", "Tan")])).toEqual([]);
  });

  it("suggests on a first name alone only when exactly one candidate has it", () => {
    const [s] = suggestGoogleReviewMatches(review("Jane"), [candidate("c1", "Jane", "Tan"), candidate("c2", "Mary", "Lim")]);
    expect(s).toMatchObject({ customerId: "c1", match: "first_name", reason: "first name, the only one; asked 9 days before" });
  });

  it("gives no suggestion on a shared first name", () => {
    expect(ids(review("Jane"), [candidate("c1", "Jane", "Tan"), candidate("c2", "Jane", "Lim")])).toEqual([]);
    // Still shared when Staff ruled one of them out: the other is not suggested on the name alone.
    expect(
      ids(review("Jane"), [candidate("c1", "Jane", "Tan", { rejected: true }), candidate("c2", "Jane", "Lim")]),
    ).toEqual([]);
    // A fuller name still tells them apart.
    expect(ids(review("Jane Lim"), [candidate("c1", "Jane", "Tan"), candidate("c2", "Jane", "Lim")])).toEqual(["c2"]);
  });

  it("never matches a nickname or a name that contradicts the record", () => {
    expect(ids(review("Janey"), [candidate("c1", "Jane", "Tan")])).toEqual([]);
    expect(ids(review("Jane Doe"), [candidate("c1", "Jane", "Tan")])).toEqual([]);
    // No last name on file: the full name cannot be compared, the first name can.
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", null)])).toEqual([]);
    expect(ids(review("Jane"), [candidate("c1", "Jane", null)])).toEqual(["c1"]);
  });
});

describe("suggestGoogleReviewMatches: never", () => {
  it("gives none for an anonymous or unnamed reviewer", () => {
    expect(ids(review("Jane Tan", { reviewerIsAnonymous: true }), [candidate("c1", "Jane", "Tan")])).toEqual([]);
    expect(ids(review(null), [candidate("c1", "Jane", "Tan")])).toEqual([]);
    expect(ids(review("  "), [candidate("c1", "Jane", "Tan")])).toEqual([]);
  });

  it("never re-suggests a rejected pair", () => {
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { rejected: true })])).toEqual([]);
    expect(
      ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { rejected: true, clickedAt: daysBefore(1) })]),
    ).toEqual([]);
  });

  it("never suggests a Customer already linked to another review", () => {
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { linkedElsewhere: true })])).toEqual([]);
  });
});

describe("suggestGoogleReviewMatches: timing", () => {
  it("counts someone asked within 45 days before, or delivered within 90", () => {
    const { askedWithinDays, deliveredWithinDays } = REVIEW_MATCH_RULES;
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { askedAt: daysBefore(askedWithinDays) })])).toEqual(["c1"]);
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { askedAt: daysBefore(askedWithinDays + 1) })])).toEqual([]);
    const delivered = candidate("c1", "Jane", "Tan", { askedAt: null, deliveredAt: daysBefore(deliveredWithinDays) });
    expect(suggestGoogleReviewMatches(review("Jane Tan"), [delivered])[0]?.reason).toBe("full name; delivered 90 days before");
    expect(
      ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { askedAt: null, deliveredAt: daysBefore(deliveredWithinDays + 1) })]),
    ).toEqual([]);
    // Asked after the review: not a reason.
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { askedAt: daysBefore(-1) })])).toEqual([]);
  });

  it("strengthens a candidate whose link was clicked within 3 days before, and says so", () => {
    const clicked = candidate("c2", "Jane", "Lim", { clickedAt: daysBefore(1) });
    const plain = candidate("c1", "Jane", "Lam");
    // Both match on first name and initial; the click puts c2 first.
    const out = suggestGoogleReviewMatches(review("Jane L"), [plain, clicked]);
    expect(out.map((s) => s.customerId)).toEqual(["c2", "c1"]);
    expect(out[0].reason).toBe("first name and initial; asked 9 days before; link clicked 1 day before");
    // A click 4 days before is not mentioned, and does not reorder.
    const old = suggestGoogleReviewMatches(review("Jane L"), [plain, { ...clicked, clickedAt: daysBefore(4) }]);
    expect(old.map((s) => s.customerId)).toEqual(["c1", "c2"]);
    expect(old[1].reason).not.toContain("clicked");
  });

  it("never suggests on timing alone", () => {
    const keen = candidate("c1", "Mary", "Lim", { askedAt: daysBefore(1), clickedAt: daysBefore(0), deliveredAt: daysBefore(2) });
    expect(ids(review("Jane Tan"), [keen])).toEqual([]);
  });

  it("is not a candidate without a request or a delivery in its window", () => {
    expect(ids(review("Jane Tan"), [candidate("c1", "Jane", "Tan", { askedAt: null })])).toEqual([]);
  });

  it("puts the stronger name first, and gives at most three", () => {
    const cs = [
      candidate("a", "Jane", "Tan"),
      candidate("b", "Tan", "Jane"),
      candidate("c", "Jane Tan", "Ong"),
      candidate("d", "Jane", "Tay", { clickedAt: daysBefore(1) }),
      candidate("e", "Jane", "Teo"),
    ];
    // "Jane T": a, d and e by first name and initial (d clicked, so first); b and c by no rule.
    const out = suggestGoogleReviewMatches(review("Jane T"), cs);
    expect(out.map((s) => [s.customerId, s.match])).toEqual([
      ["d", "first_name_initial"],
      ["a", "first_name_initial"],
      ["e", "first_name_initial"],
    ]);
    // "Jane Tan": a, b (surname first) and f by full name; c's first name is "Jane Tan", the only one.
    const full = suggestGoogleReviewMatches(review("Jane Tan"), [...cs, candidate("f", "Jane", "Tan", { askedAt: null, deliveredAt: daysBefore(3) })]);
    expect(full).toHaveLength(REVIEW_MATCH_RULES.maxSuggestions);
    expect(full.map((s) => s.match)).toEqual(["full_name", "full_name", "full_name"]);
    // Asked beats only delivered, at the same name strength.
    expect(full.map((s) => s.customerId)).toEqual(["a", "b", "f"]);
  });

  it("says the same day when it was", () => {
    const [s] = suggestGoogleReviewMatches(review("Jane Tan"), [
      candidate("c1", "Jane", "Tan", { askedAt: daysBefore(0.2), clickedAt: daysBefore(0.1) }),
    ]);
    expect(s.reason).toBe("full name; asked the same day; link clicked the same day");
  });
});
