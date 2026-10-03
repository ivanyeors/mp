import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, GOOGLE_REVIEW_DEFAULTS, type Row } from "./fake-supabase";
import type { BusinessProfileClient, GbpReview } from "@/lib/google/business-profile";

/**
 * The sync turns Google's newest reviews into rows and cards. Driven against
 * an in-memory table so the outcomes — which rows exist, in which status,
 * which cards went out — are observed rather than inferred from calls.
 */

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof createFakeSupabase>, tables: {} as Record<string, Row[]> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));

const { syncGoogleReviews, initialState, NOTIFY_WINDOW_DAYS } = await import("@/lib/reviews/google-sync");

const LOCATION = "accounts/1/locations/2";
const NOW = new Date("2026-10-02T08:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function review(id: string, extra: Partial<GbpReview> = {}): GbpReview {
  return {
    name: `${LOCATION}/reviews/${id}`,
    reviewer: { displayName: "Jane Tan" },
    starRating: "FIVE",
    comment: "Lovely pillow",
    createTime: daysAgo(1),
    updateTime: daysAgo(1),
    ...extra,
  };
}

function client(reviews: GbpReview[]): BusinessProfileClient {
  return {
    listReviews: vi.fn(async () => ({ reviews, nextPageToken: null, averageRating: null, totalReviewCount: null })),
    getReview: vi.fn(),
    updateReply: vi.fn(),
  };
}

const draft = vi.fn(async () => ({ ok: true as const, reply: "Thank you, Jane!", model: "claude-opus-5-5" }));
let messageId = 100;
const send = vi.fn(async () => ({ chatId: -1001279910218, messageId: (messageId += 1) }));
type Markup = { inline_keyboard: { text: string }[][] };
const edit = vi.fn<(messageId: number, text: string, markup?: Markup) => Promise<boolean>>(async () => true);

const rows = () => (h.tables.google_reviews ?? []) as Row[];
const byName = (id: string) => rows().find((r) => r.review_name === `${LOCATION}/reviews/${id}`);

beforeEach(() => {
  vi.clearAllMocks();
  messageId = 100;
  h.tables = { google_reviews: [] };
  h.db = createFakeSupabase(h.tables, { google_reviews: GOOGLE_REVIEW_DEFAULTS });
});

const run = (reviews: GbpReview[], extra = {}) =>
  syncGoogleReviews({ client: client(reviews), location: LOCATION, now: NOW, draft, send, edit, ...extra });

describe("syncGoogleReviews", () => {
  it("drafts and posts a card for a new review, and stores the card id", async () => {
    const summary = await run([review("r1")]);

    expect(summary).toMatchObject({ fetched: 1, inserted: 1, carded: 1 });
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({ starRating: 5, comment: "Lovely pillow" }));
    expect(send).toHaveBeenCalledOnce();
    expect(String((send.mock.calls[0] as unknown[])[0])).toContain("Thank you, Jane!");
    expect(byName("r1")).toMatchObject({
      status: "pending",
      draft_reply: "Thank you, Jane!",
      draft_source: "claude",
      draft_version: 1,
      telegram_message_id: 101,
    });
  });

  it("is idempotent: a second run sends nothing new", async () => {
    await run([review("r1")]);
    const again = await run([review("r1")]);
    expect(again).toMatchObject({ inserted: 0, carded: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(rows()).toHaveLength(1);
  });

  it("records old and already-answered reviews without a card", async () => {
    const summary = await run([
      review("old", { createTime: daysAgo(NOTIFY_WINDOW_DAYS + 30), updateTime: daysAgo(NOTIFY_WINDOW_DAYS + 1) }),
      review("answered", { reviewReply: { comment: "Thanks from the owner", updateTime: daysAgo(1) } }),
    ]);
    expect(summary).toMatchObject({ inserted: 2, backlog: 1, carded: 0 });
    expect(byName("old")?.status).toBe("backlog");
    expect(byName("answered")).toMatchObject({ status: "replied_elsewhere", google_reply: "Thanks from the owner" });
    expect(send).not.toHaveBeenCalled();
  });

  it("caps how many cards one run sends", async () => {
    const summary = await run(
      Array.from({ length: 6 }, (_, i) => review(`r${i}`)),
      { maxCards: 2 },
    );
    expect(summary.carded).toBe(2);
    expect(rows().filter((r) => r.status === "new")).toHaveLength(4);
  });

  it("keeps a card whose draft failed, with the reason and no Post button", async () => {
    draft.mockResolvedValueOnce({ ok: false, error: "ANTHROPIC_API_KEY is not set" } as never);
    await run([review("r1")]);
    expect(byName("r1")).toMatchObject({ status: "pending", draft_reply: null, draft_error: "ANTHROPIC_API_KEY is not set" });
    const markup = (send.mock.calls[0] as unknown[])[1] as { inline_keyboard: { text: string }[][] };
    expect(markup.inline_keyboard.flat().map((b) => b.text)).not.toContain("✅ Post reply");
  });

  it("leaves a card that failed to send for the next run to retry", async () => {
    send.mockResolvedValueOnce(null as never);
    await run([review("r1")]);
    expect(byName("r1")).toMatchObject({ status: "pending", telegram_message_id: null });

    // Ten minutes later the orphan is picked up again.
    const later = new Date(NOW.getTime() + 11 * 60_000);
    byName("r1")!.updated_at = NOW.toISOString();
    const summary = await run([review("r1")], { now: later });
    expect(summary.carded).toBe(1);
    expect(byName("r1")?.telegram_message_id).toBeTypeOf("number");
  });

  it("marks an open card answered elsewhere when a reply appears on Google", async () => {
    await run([review("r1")]);
    const summary = await run([
      review("r1", { reviewReply: { comment: "Replied in the Maps app", updateTime: daysAgo(0) } }),
    ]);
    expect(summary.repliedElsewhere).toBe(1);
    expect(byName("r1")?.status).toBe("replied_elsewhere");
    expect(edit).toHaveBeenCalledWith(101, expect.stringContaining("Replied in the Maps app"), undefined);
  });

  it("re-renders an open card when the reviewer edits their review", async () => {
    await run([review("r1")]);
    await run([review("r1", { comment: "Even better after a week", updateTime: daysAgo(0) })]);
    expect(byName("r1")).toMatchObject({ status: "pending", comment: "Even better after a week" });
    expect(edit).toHaveBeenCalledWith(101, expect.stringContaining("Even better after a week"), expect.anything());
  });

  it("redrafts an open card when the reviewer drops the rating into service recovery", async () => {
    await run([review("r1")]);
    draft.mockResolvedValueOnce({ ok: true, reply: "We're sorry the fit let you down, Jane.", model: "claude-opus-5-5" });
    const summary = await run([review("r1", { starRating: "TWO", comment: "Neck hurts now", updateTime: daysAgo(0) })]);

    expect(summary.redrafted).toBe(1);
    expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({ starRating: 2, comment: "Neck hurts now" }));
    expect(byName("r1")).toMatchObject({
      status: "pending",
      draft_reply: "We're sorry the fit let you down, Jane.",
      draft_version: 2,
    });
    const text = String(edit.mock.calls.at(-1)?.[1]);
    expect(text).toContain("🛟 SERVICE RECOVERY");
    expect(text).toContain("Service recovery reply, drafted by Claude");
  });

  it("withdraws a draft that no longer fits when the redraft fails", async () => {
    await run([review("r1")]);
    draft.mockResolvedValueOnce({ ok: false, error: "Claude is rate-limited" } as never);
    await run([review("r1", { starRating: "ONE", updateTime: daysAgo(0) })]);

    expect(byName("r1")).toMatchObject({ draft_reply: null, draft_version: 2 });
    expect(String(byName("r1")?.draft_error)).toMatch(/rating changed/);
    const markup = edit.mock.calls.at(-1)?.[2];
    expect(markup?.inline_keyboard.flat().map((b) => b.text)).not.toContain("✅ Post reply");
  });

  it("keeps a review manager's own wording when the rating changes", async () => {
    await run([review("r1")]);
    Object.assign(byName("r1")!, { draft_reply: "Thanks from Ivan", draft_source: "staff" });
    const summary = await run([review("r1", { starRating: "TWO", updateTime: daysAgo(0) })]);

    expect(summary.redrafted).toBe(0);
    expect(byName("r1")?.draft_reply).toBe("Thanks from Ivan");
    expect(String(edit.mock.calls.at(-1)?.[1])).toContain("🛟 SERVICE RECOVERY");
  });

  it("does not redraft when an edit keeps the same reply type", async () => {
    await run([review("r1")]);
    const summary = await run([review("r1", { starRating: "FOUR", updateTime: daysAgo(0) })]);
    expect(summary.redrafted).toBe(0);
    expect(draft).toHaveBeenCalledOnce();
  });

  it("hands a post that died mid-flight back to the review managers", async () => {
    h.tables.google_reviews.push({
      ...GOOGLE_REVIEW_DEFAULTS,
      id: "stuck",
      review_name: `${LOCATION}/reviews/stuck`,
      status: "posting",
      draft_reply: "Thanks",
      telegram_message_id: 55,
      updated_at: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
    });
    const summary = await run([]);
    expect(summary.recovered).toBe(1);
    expect(h.tables.google_reviews[0]).toMatchObject({ status: "pending", last_error: expect.stringMatching(/interrupted/) });
    expect(edit).toHaveBeenCalledWith(55, expect.any(String), expect.anything());
  });

  it("does nothing until Google is configured", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", "");
    expect(await syncGoogleReviews({ now: NOW })).toMatchObject({ skipped: "not_configured", fetched: 0 });
    vi.unstubAllEnvs();
  });
});

describe("initialState", () => {
  const old = { createTime: daysAgo(400), updateTime: daysAgo(400) };

  it("cards fresh, unanswered reviews and records old ones as backlog", () => {
    expect(initialState(review("a"), NOW)).toEqual({ status: "new", reopened: false });
    expect(initialState(review("a", old), NOW)).toEqual({ status: "backlog", reopened: false });
  });

  it("counts an old review its author just edited as fresh", () => {
    expect(initialState(review("a", { createTime: daysAgo(400), updateTime: daysAgo(1) }), NOW)).toEqual({
      status: "new",
      reopened: false,
    });
  });

  it("cards an answered review only when it was edited after the reply, recently", () => {
    const answered = { reviewReply: { comment: "Thanks!", updateTime: daysAgo(3) } };
    expect(initialState(review("a", { ...answered, updateTime: daysAgo(3) }), NOW).status).toBe("replied_elsewhere");
    expect(initialState(review("a", { ...answered, updateTime: daysAgo(1) }), NOW)).toEqual({
      status: "new",
      reopened: true,
    });
    expect(
      initialState(review("a", { ...old, reviewReply: { comment: "Thanks!", updateTime: daysAgo(500) } }), NOW).status,
    ).toBe("replied_elsewhere");
  });
});

describe("reopening a review whose rating changed reply type", () => {
  const OUR_REPLY = "Thank you, Jane!";

  /** First run cards r1 (message 101); then a review manager posts the draft. */
  async function postedFiveStar() {
    await run([review("r1")]);
    Object.assign(byName("r1")!, {
      status: "posted",
      posted_reply: OUR_REPLY,
      posted_at: daysAgo(1),
      google_reply: OUR_REPLY,
      google_reply_updated_at: daysAgo(1),
      acted_by_name: "Ivan",
    });
    vi.clearAllMocks();
  }
  const answered = { reviewReply: { comment: OUR_REPLY, updateTime: daysAgo(1) } };

  it("drops 5★ → 2★ after we replied: a new service-recovery card that replaces our reply", async () => {
    await postedFiveStar();
    draft.mockResolvedValueOnce({
      ok: true,
      reply: "We're sorry it got worse, Jane. Please message us on WhatsApp at +65 8780 5311.",
      model: "claude-opus-5-5",
    });
    const summary = await run([
      review("r1", { ...answered, starRating: "TWO", comment: "Flattened after a month", updateTime: daysAgo(0) }),
    ]);

    expect(summary).toMatchObject({ reopened: 1, carded: 1 });
    expect(draft).toHaveBeenCalledWith(
      expect.objectContaining({ starRating: 2, update: { previousRating: 5, previousReply: OUR_REPLY } }),
    );
    expect(byName("r1")).toMatchObject({
      status: "pending",
      reopened_from_rating: 5,
      telegram_message_id: 102,
      posted_reply: OUR_REPLY,
    });

    const card = send.mock.calls[0] as unknown as [string, Markup];
    expect(card[0]).toContain("🛟 SERVICE RECOVERY");
    expect(card[0]).toContain("🔄 REOPENED — the rating changed from 5★ to 2★ after it was answered.");
    expect(card[0]).toContain(`💬 Our reply on Google now (posting replaces it):\n${OUR_REPLY}`);
    expect(card[1].inline_keyboard.flat()[0].text).toBe("✅ Post reply");
    // The old card stays as history and points at the new one.
    expect(edit).toHaveBeenCalledWith(
      101,
      expect.stringContaining("🔄 Reopened in a new card below — the rating changed from 5★ to 2★."),
    );
  });

  it("improves 2★ → 5★ after a recovery reply: a new thank-you card", async () => {
    await run([review("r1", { starRating: "TWO" })]);
    Object.assign(byName("r1")!, { status: "posted", posted_reply: "Sorry", google_reply: "Sorry" });
    vi.clearAllMocks();
    const summary = await run([
      review("r1", { reviewReply: { comment: "Sorry", updateTime: daysAgo(1) }, starRating: "FIVE", updateTime: daysAgo(0) }),
    ]);

    expect(summary.reopened).toBe(1);
    expect(draft).toHaveBeenCalledWith(
      expect.objectContaining({ starRating: 5, update: { previousRating: 2, previousReply: "Sorry" } }),
    );
    const text = String((send.mock.calls[0] as unknown[])[0]);
    expect(text).toContain("the rating changed from 2★ to 5★");
    expect(text).toContain("Thank-you reply, drafted by Claude");
    expect(text).not.toContain("SERVICE RECOVERY");
  });

  it("leaves a posted review alone when an edit keeps the same reply type", async () => {
    await postedFiveStar();
    const summary = await run([review("r1", { ...answered, starRating: "FOUR", updateTime: daysAgo(0) })]);
    expect(summary).toMatchObject({ reopened: 0, carded: 0 });
    expect(byName("r1")).toMatchObject({ status: "posted", star_rating: 4 });
    expect(send).not.toHaveBeenCalled();
  });

  it("reopens a skipped review, and a backlog one that never had a card", async () => {
    await run([review("r1")]);
    Object.assign(byName("r1")!, { status: "skipped" });
    await run([
      review("old", { createTime: daysAgo(400), updateTime: daysAgo(400), starRating: "FOUR" }),
    ]);
    expect(byName("old")?.status).toBe("backlog");
    vi.clearAllMocks();

    const summary = await run([
      review("r1", { starRating: "ONE", updateTime: daysAgo(0) }),
      review("old", { createTime: daysAgo(400), updateTime: daysAgo(0), starRating: "TWO" }),
    ]);
    expect(summary).toMatchObject({ reopened: 2, carded: 2 });
    const texts = send.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(texts.some((t) => t.includes("the rating changed from 5★ to 1★."))).toBe(true);
    expect(texts.some((t) => t.includes("the rating changed from 4★ to 2★."))).toBe(true);
  });

  it("cards a review first seen already edited after it was answered", async () => {
    const summary = await run([
      review("r9", { reviewReply: { comment: "Thanks!", updateTime: daysAgo(5) }, starRating: "ONE", updateTime: daysAgo(0) }),
    ]);
    expect(summary).toMatchObject({ reopened: 1, carded: 1 });
    expect(String((send.mock.calls[0] as unknown[])[0])).toContain(
      "🔄 REOPENED — the reviewer edited this review after it was answered.",
    );
  });

  it("keeps a reopened card open when the reply on Google is someone else's and has not changed", async () => {
    const theirReply = { reviewReply: { comment: "Thanks!", updateTime: daysAgo(5) } };
    await run([review("r9", { ...theirReply, starRating: "ONE", updateTime: daysAgo(1) })]);
    expect(byName("r9")).toMatchObject({ status: "pending", posted_reply: null });

    await run([review("r9", { ...theirReply, starRating: "ONE", comment: "Also rude staff", updateTime: daysAgo(0) })]);
    expect(byName("r9")).toMatchObject({ status: "pending", comment: "Also rude staff" });
  });

  it("keeps a reopened card open while Google still shows our old reply, and closes it when a new one appears", async () => {
    await postedFiveStar();
    await run([review("r1", { ...answered, starRating: "TWO", updateTime: daysAgo(0) })]);
    expect(byName("r1")?.status).toBe("pending");

    await run([review("r1", { ...answered, starRating: "TWO", comment: "Still flat", updateTime: daysAgo(0) })]);
    expect(byName("r1")?.status).toBe("pending");

    await run([
      review("r1", { reviewReply: { comment: "Replied in Maps", updateTime: daysAgo(0) }, starRating: "TWO", updateTime: daysAgo(0) }),
    ]);
    expect(byName("r1")?.status).toBe("replied_elsewhere");
  });
});
