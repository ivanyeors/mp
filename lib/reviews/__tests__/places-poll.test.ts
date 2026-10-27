import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, GOOGLE_REVIEW_DEFAULTS, type Row } from "./fake-supabase";
import type { PlaceReview, PlaceReviewsRead } from "@/lib/google/places-reviews";

/**
 * The weekly Places poll: one billed read, counted against a monthly cap
 * before it is made; its reviews carded like Business Profile ones but
 * answered on Google Maps by hand; reviews the five do not show announced;
 * Places content gone after 30 days; and standing down once the Business
 * Profile API is configured.
 */

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  businessProfile: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));
vi.mock("@/lib/google/business-profile", async (orig) => ({
  ...(await orig<typeof import("@/lib/google/business-profile")>()),
  getBusinessProfileConfig: () => h.businessProfile,
}));

const { pollPlacesReviews, pollMonth, DEFAULT_PLACES_POLL_CAP, PLACES_RETENTION_DAYS } = await import(
  "@/lib/reviews/places-poll"
);

const NOW = new Date("2026-10-13T02:00:00Z");
const MONTH = "2026-10-01";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function placeReview(id: string, extra: Partial<PlaceReview> = {}): PlaceReview {
  return {
    name: `places/ChIJ-test/reviews/${id}`,
    rating: 5,
    text: "Lovely pillow",
    authorName: "Jane Tan",
    publishTime: daysAgo(1),
    mapsUri: `https://www.google.com/maps/reviews/data=${id}`,
    ...extra,
  };
}

const ok = (reviews: PlaceReview[], ratingCount: number | null = 40): PlaceReviewsRead => ({
  ok: true,
  reviews,
  ratingCount,
  mapsUri: "https://maps.google.com/?cid=1",
});

const draft = vi.fn(async () => ({ ok: true as const, reply: "Thank you, Jane!", model: "claude-opus-5-5" }));
let messageId = 100;
const send = vi.fn(async () => ({ chatId: -1001279910218, messageId: (messageId += 1) }));
type Markup = { inline_keyboard: { text: string; url?: string }[][] };
const edit = vi.fn<(messageId: number, text: string, markup?: Markup) => Promise<boolean>>(async () => true);
const notify = vi.fn(async () => ({ ok: true as const, chatId: -1, messageId: 1 }));

const reviews = () => (h.tables.google_reviews ?? []) as Row[];
const poll = () => (h.tables.google_places_polls ?? []).find((r) => r.month === MONTH);

function run(read: () => Promise<PlaceReviewsRead>, extra: { now?: Date; force?: boolean } = {}) {
  return pollPlacesReviews({ now: NOW, read, draft, send, edit, notify, matchLink: async () => null, ...extra });
}
const weekLater = new Date(NOW.getTime() + 7 * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  messageId = 100;
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "key");
  vi.stubEnv("GOOGLE_PLACE_ID", "ChIJ-test");
  vi.stubEnv("GOOGLE_PLACES_POLL_MONTHLY_CAP", "");
  h.businessProfile = null;
  h.tables = { google_reviews: [], google_places_polls: [] };
  h.db = createFakeSupabase(h.tables, {
    google_reviews: GOOGLE_REVIEW_DEFAULTS,
    google_places_polls: { calls: 0, rating_count: null, last_error: null, last_polled_at: null },
  });
});

describe("pollPlacesReviews", () => {
  it("cards a new review as a Places review, answered on Google Maps, and counts the read", async () => {
    const read = vi.fn(async () => ok([placeReview("r1")]));
    const summary = await run(read);

    expect(summary).toMatchObject({ ok: true, calls: 1, cap: DEFAULT_PLACES_POLL_CAP, missed: 0 });
    expect(read).toHaveBeenCalledOnce();
    expect(reviews()[0]).toMatchObject({
      source: "places",
      review_name: "places/ChIJ-test/reviews/r1",
      maps_uri: "https://www.google.com/maps/reviews/data=r1",
      star_rating: 5,
      reviewer_name: "Jane Tan",
      status: "pending",
      draft_reply: "Thank you, Jane!",
    });
    const [, markup] = send.mock.calls[0] as unknown as [string, Markup];
    expect(markup.inline_keyboard.flat().map((b) => b.text)).toEqual(["🔗 Open on Google Maps", "✅ Mark replied", "🙈 Skip"]);
    expect(poll()).toMatchObject({ calls: 1, rating_count: 40, last_error: null, last_polled_at: NOW.toISOString() });
  });

  it("reads once a week from the daily cron, and on demand when forced", async () => {
    const read = vi.fn(async () => ok([]));
    await run(read);
    expect(await run(read, { now: new Date(NOW.getTime() + 86_400_000) })).toMatchObject({ skipped: "not_due" });
    expect(read).toHaveBeenCalledOnce();

    // The cron starts a few seconds earlier one week than the last: still due.
    expect(await run(read, { now: new Date(weekLater.getTime() - 5_000) })).toMatchObject({ ok: true, calls: 2 });
    expect(await run(read, { now: weekLater, force: true })).toMatchObject({ ok: true, calls: 3 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("tries again the next day when a read fails", async () => {
    await run(async () => ({ ok: false, error: "Places API 503: unavailable" }));
    const read = vi.fn(async () => ok([]));
    await run(read, { now: new Date(NOW.getTime() + 86_400_000) });
    expect(read).toHaveBeenCalledOnce();
  });

  it("records an old review without a card, and does not card it twice", async () => {
    await run(async () => ok([placeReview("old", { publishTime: daysAgo(200) })]));
    await run(async () => ok([placeReview("old", { publishTime: daysAgo(200) })]), { now: weekLater });
    expect(reviews()).toHaveLength(1);
    expect(reviews()[0].status).toBe("backlog");
    expect(send).not.toHaveBeenCalled();
    expect(poll()?.calls).toBe(2);
  });

  it("stops at the monthly cap before making a billed read", async () => {
    h.tables.google_places_polls.push({ month: MONTH, calls: DEFAULT_PLACES_POLL_CAP, rating_count: 40 });
    const read = vi.fn(async () => ok([placeReview("r1")]));
    const summary = await run(read);
    expect(summary).toMatchObject({ ok: true, skipped: "monthly_cap", calls: DEFAULT_PLACES_POLL_CAP });
    expect(read).not.toHaveBeenCalled();
  });

  it("never lets the cap be set past half the free reads", async () => {
    vi.stubEnv("GOOGLE_PLACES_POLL_MONTHLY_CAP", "5000");
    const summary = await run(async () => ok([]));
    expect(summary.cap).toBe(500);
  });

  it("stands down once the Business Profile API is configured", async () => {
    h.businessProfile = { location: "accounts/1/locations/2", clientId: "c", clientSecret: "s", refreshToken: "r" };
    const read = vi.fn(async () => ok([placeReview("r1")]));
    expect(await run(read)).toMatchObject({ ok: true, skipped: "business_profile" });
    expect(read).not.toHaveBeenCalled();
    expect(poll()).toBeUndefined();
  });

  it("does nothing without a Places key and place id", async () => {
    vi.stubEnv("GOOGLE_PLACE_ID", "");
    const read = vi.fn(async () => ok([]));
    expect(await run(read)).toMatchObject({ ok: true, skipped: "not_configured" });
    expect(read).not.toHaveBeenCalled();
  });

  it("announces new reviews that Google counted but the five did not include", async () => {
    h.tables.google_places_polls.push({ month: "2026-09-01", calls: 4, rating_count: 40 });
    // Three more reviews on Google; one of them came back in the five.
    const summary = await run(async () => ok([placeReview("r1")], 43));
    expect(summary).toMatchObject({ ok: true, missed: 2 });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^⭐ 2 new Google reviews didn't come through as a card/));
    expect(poll()?.rating_count).toBe(43);
  });

  it("says nothing on the first read, with no earlier count to compare", async () => {
    await run(async () => ok([], 43));
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps the failed read on the count, and says why", async () => {
    const summary = await run(async () => ({ ok: false, error: "Places API 403: API key not valid" }));
    expect(summary).toEqual({ ok: false, calls: 1, cap: DEFAULT_PLACES_POLL_CAP, purged: 0, error: "Places API 403: API key not valid" });
    expect(poll()).toMatchObject({ calls: 1, last_error: "Places API 403: API key not valid" });
  });

  it(`deletes Places rows after ${PLACES_RETENTION_DAYS} days, closing an open card, and keeps Business Profile rows`, async () => {
    const old = daysAgo(PLACES_RETENTION_DAYS + 1);
    h.tables.google_reviews.push(
      { ...GOOGLE_REVIEW_DEFAULTS, id: "a", source: "places", review_name: "places/ChIJ-test/reviews/a", comment: "Secret", status: "pending", telegram_message_id: 55, created_at: old },
      { ...GOOGLE_REVIEW_DEFAULTS, id: "b", source: "places", review_name: "places/ChIJ-test/reviews/b", status: "posted", created_at: old },
      { ...GOOGLE_REVIEW_DEFAULTS, id: "c", source: "places", review_name: "places/ChIJ-test/reviews/c", status: "pending", created_at: daysAgo(2) },
      { ...GOOGLE_REVIEW_DEFAULTS, id: "d", source: "business_profile", review_name: "accounts/1/locations/2/reviews/d", status: "posted", created_at: old },
    );
    const summary = await run(async () => ok([]));

    expect(summary).toMatchObject({ purged: 2 });
    expect(reviews().map((r) => r.id)).toEqual(["c", "d"]);
    expect(edit).toHaveBeenCalledOnce();
    const [cardId, text] = edit.mock.calls[0];
    expect(cardId).toBe(55);
    expect(text).toContain("⌛ This card closed after 30 days");
    expect(text).not.toContain("Secret");
  });

  it("keys the budget by calendar month", () => {
    expect(pollMonth(new Date("2026-12-31T23:59:00Z"))).toBe("2026-12-01");
    expect(pollMonth(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });
});
