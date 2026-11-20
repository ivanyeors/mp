import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, GOOGLE_REVIEW_DEFAULTS, type Row } from "./fake-supabase";

const REVIEW_ID = "3f2b7c1e-8a4d-4e9b-9c11-0123456789ab";
const CARD = 77;

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));

const { markReviewRepliedByStaff, redraftReviewReply } = await import("@/lib/reviews/admin-reply");
const { canMarkReplied } = await import("@/lib/reviews/mark-replied");
const { googleReviewAnswer } = await import("@/lib/crm/google-review-match-server");

const review = () => (h.tables.google_reviews as Row[])[0]!;

function seed(over: Row = {}) {
  h.tables = {
    google_reviews: [
      {
        ...GOOGLE_REVIEW_DEFAULTS,
        id: REVIEW_ID,
        review_name: "places/x/reviews/1",
        source: "places",
        maps_uri: "https://maps.google.com/review/1",
        star_rating: 1,
        comment: "Sore neck.",
        reviewer_name: "Mei T.",
        status: "pending",
        draft_reply: "The first draft.",
        draft_source: "claude",
        draft_version: 3,
        telegram_message_id: CARD,
        created_at: "2026-02-23T08:00:00Z",
        updated_at: "2026-02-23T08:00:00Z",
        ...over,
      },
    ],
  };
  h.db = createFakeSupabase(h.tables);
}

const deps = () => ({
  draft: vi.fn(async () => ({ ok: true as const, reply: "A new draft.", model: "m" })),
  edit: vi.fn(async (_messageId: number, _text: string, _markup?: unknown) => undefined),
  matchLink: vi.fn(async () => null),
});

beforeEach(() => seed());

describe("redraftReviewReply", () => {
  it("keeps the draft on a review still waiting, moves its version on, and redraws the card", async () => {
    const d = deps();
    const result = await redraftReviewReply(REVIEW_ID, d as never);
    expect(result).toEqual({ ok: true, reply: "A new draft.", saved: true });
    expect(review().draft_reply).toBe("A new draft.");
    expect(review().draft_source).toBe("claude");
    expect(review().draft_version).toBe(4);
    expect(d.edit).toHaveBeenCalledTimes(1);
    expect(d.edit.mock.calls[0]![0]).toBe(CARD);
    expect(String(d.edit.mock.calls[0]![1])).toContain("A new draft.");
  });

  it("hands the draft back without a write once the review is settled", async () => {
    seed({ status: "posted", posted_reply: "What we posted." });
    const d = deps();
    const result = await redraftReviewReply(REVIEW_ID, d as never);
    expect(result).toEqual({ ok: true, reply: "A new draft.", saved: false });
    expect(review().draft_reply).toBe("The first draft.");
    expect(review().draft_version).toBe(3);
    expect(d.edit).not.toHaveBeenCalled();
  });

  it("does not replace a draft a review manager wrote on the Telegram card", async () => {
    seed({ draft_reply: "Written by hand in Telegram.", draft_source: "staff" });
    const d = deps();
    const result = await redraftReviewReply(REVIEW_ID, d as never);
    expect(result).toEqual({ ok: true, reply: "A new draft.", saved: false });
    expect(review().draft_reply).toBe("Written by hand in Telegram.");
    expect(review().draft_version).toBe(3);
    expect(d.edit).not.toHaveBeenCalled();
  });

  it("says why when Claude could not draft, and writes nothing", async () => {
    const d = { ...deps(), draft: vi.fn(async () => ({ ok: false as const, error: "Claude is not configured" })) };
    const result = await redraftReviewReply(REVIEW_ID, d as never);
    expect(result).toEqual({ ok: false, reason: "draft_failed", message: "Claude is not configured" });
    expect(review().draft_version).toBe(3);
  });

  it("answers not found for a review that is gone", async () => {
    const result = await redraftReviewReply("00000000-0000-4000-8000-000000000000", deps() as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("does not fail when Telegram cannot be reached", async () => {
    const d = { ...deps(), edit: vi.fn(async () => Promise.reject(new Error("telegram down"))) };
    const result = await redraftReviewReply(REVIEW_ID, d as never);
    expect(result.ok).toBe(true);
    expect(review().draft_reply).toBe("A new draft.");
  });
});

describe("markReviewRepliedByStaff", () => {
  it("records the reply Staff pasted, who marked it, and closes the card", async () => {
    const d = deps();
    const result = await markReviewRepliedByStaff(REVIEW_ID, '  "Mei, I am sorry."  ', "Sophie", d as never);
    expect(result.ok).toBe(true);
    expect(review().status).toBe("posted");
    expect(review().posted_reply).toBe("Mei, I am sorry.");
    expect(review().acted_by_name).toBe("Sophie");
    expect(review().acted_by_telegram_user_id).toBeNull();
    expect(review().posted_at).toBeTruthy();
    expect(d.edit).toHaveBeenCalledTimes(1);
  });

  it("refuses a second mark", async () => {
    await markReviewRepliedByStaff(REVIEW_ID, "Mei, I am sorry.", "Sophie", deps() as never);
    const again = await markReviewRepliedByStaff(REVIEW_ID, "Something else.", "Kai", deps() as never);
    expect(again).toMatchObject({ ok: false, reason: "already" });
    expect(review().posted_reply).toBe("Mei, I am sorry.");
    expect(review().acted_by_name).toBe("Sophie");
  });

  it("marks a review that never had a card, with no card to redraw", async () => {
    seed({ status: "backlog", telegram_message_id: null, draft_reply: null });
    const d = deps();
    const result = await markReviewRepliedByStaff(REVIEW_ID, "Thank you, Mei.", "Sophie", d as never);
    expect(result.ok).toBe(true);
    expect(review().status).toBe("posted");
    expect(d.edit).not.toHaveBeenCalled();
  });

  it("refuses a Business Profile review: Google reports its reply", async () => {
    seed({ source: "business_profile" });
    const result = await markReviewRepliedByStaff(REVIEW_ID, "Thank you.", "Sophie", deps() as never);
    expect(result).toMatchObject({ ok: false, reason: "not_places" });
    expect(review().status).toBe("pending");
  });

  it("refuses an empty reply, and one over Google's limit", async () => {
    expect(await markReviewRepliedByStaff(REVIEW_ID, "   ", "Sophie", deps() as never)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await markReviewRepliedByStaff(REVIEW_ID, "x".repeat(1501), "Sophie", deps() as never)).toMatchObject({ ok: false, reason: "invalid" });
    expect(review().status).toBe("pending");
  });
});

describe("canMarkReplied", () => {
  it("is for a Places review with no reply on record", () => {
    for (const status of ["new", "pending", "backlog", "skipped"]) expect(canMarkReplied({ source: "places", status })).toBe(true);
    for (const status of ["posting", "posted", "replied_elsewhere"]) expect(canMarkReplied({ source: "places", status })).toBe(false);
    expect(canMarkReplied({ source: "business_profile", status: "pending" })).toBe(false);
  });
});

describe("googleReviewAnswer", () => {
  const row = { status: "pending", source: "places" as const, maps_uri: null, draft_reply: null, posted_reply: null, google_reply: null };
  const LISTING = "https://search.google.com/local/reviews?placeid=x";

  it("opens the review itself when Places gave its page, else the shop's reviews", () => {
    expect(googleReviewAnswer({ ...row, maps_uri: " https://maps.google.com/review/1 " }, LISTING)).toMatchObject({
      url: "https://maps.google.com/review/1",
      urlIsReview: true,
    });
    expect(googleReviewAnswer(row, LISTING)).toMatchObject({ url: LISTING, urlIsReview: false });
    expect(googleReviewAnswer(row, null)).toMatchObject({ url: null, urlIsReview: false });
  });

  it("carries the draft while nothing is posted, and what was posted once it is", () => {
    expect(googleReviewAnswer({ ...row, draft_reply: "A draft." }, null)).toMatchObject({ draft: "A draft.", posted: null, canMarkReplied: true });
    expect(googleReviewAnswer({ ...row, status: "posted", posted_reply: "Posted." }, null)).toMatchObject({ posted: "Posted.", canMarkReplied: false });
    expect(googleReviewAnswer({ ...row, source: "business_profile", google_reply: "On Google." }, null)).toMatchObject({
      posted: "On Google.",
      canMarkReplied: false,
    });
  });
});
