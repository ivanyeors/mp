import { describe, expect, it } from "vitest";
import {
  GOOGLE_CARD_HEADER,
  SHOP_CARD_HEADER,
  encodeReviewCallback,
  parseReviewCallback,
  renderExpiredPlacesCard,
  renderGoogleReviewCard,
  renderMissedReviewsNotice,
  renderShopReviewCard,
  starLine,
  type ReviewCallback,
} from "@/lib/reviews/cards";
import type { GoogleReviewRow } from "@/lib/reviews/google-reviews";

const ID = "3f2b7c1e-8a4d-4e9b-9c11-0123456789ab";

function row(overrides: Partial<GoogleReviewRow> = {}): GoogleReviewRow {
  return {
    id: ID,
    review_name: "accounts/1/locations/2/reviews/abc",
    source: "business_profile",
    maps_uri: null,
    star_rating: 5,
    comment: "Best pillow I have owned. The fitting took ten minutes.",
    reviewer_name: "Jane Tan",
    reviewer_is_anonymous: false,
    review_created_at: "2026-10-01T02:00:00Z",
    review_updated_at: "2026-10-01T02:00:00Z",
    google_reply: null,
    google_reply_updated_at: null,
    status: "pending",
    draft_reply: "Thank you, Jane! We're glad the fitting was quick.",
    draft_source: "claude",
    draft_version: 3,
    draft_error: null,
    posted_reply: null,
    posted_at: null,
    acted_by_telegram_user_id: null,
    acted_by_name: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    last_error: null,
    reopened_at: null,
    reopened_from_rating: null,
    created_at: "2026-10-01T02:01:00Z",
    updated_at: "2026-10-01T02:01:00Z",
    ...overrides,
  };
}

const buttons = (card: ReturnType<typeof renderGoogleReviewCard>) =>
  (card.replyMarkup?.inline_keyboard ?? []).flat();

describe("review callback data", () => {
  const cases: ReviewCallback[] = [
    { source: "google", action: "post", id: ID, version: 12 },
    { source: "google", action: "done", id: ID, version: 12 },
    { source: "google", action: "skip", id: ID },
    { source: "shop", action: "approve", id: ID },
    { source: "shop", action: "reject", id: ID },
    { source: "shop", action: "unreply", id: ID },
  ];

  it.each(cases)("round-trips %o inside Telegram's 64 bytes", (cb) => {
    const data = encodeReviewCallback(cb);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseReviewCallback(data)).toEqual(cb);
  });

  it("rejects anything else, including the inventory bot's callbacks", () => {
    for (const data of ["pill:XS", "rv:g:post:not-a-uuid:1", `rv:g:post:${ID}`, `rv:g:delete:${ID}`, `rv:s:approve:${ID}:1`, `rv:g:unreply:${ID}`, ""]) {
      expect(parseReviewCallback(data)).toBeNull();
    }
  });
});

describe("Google review card", () => {
  it("leads with the source and offers Post for the draft version on screen", () => {
    const card = renderGoogleReviewCard(row());
    expect(card.text.split("\n")[0]).toBe(GOOGLE_CARD_HEADER);
    expect(card.text).toContain("★★★★★ 5/5 · Jane Tan");
    expect(card.text).toContain("drafted by Claude");
    expect(buttons(card).map((b) => b.text)).toEqual(["✅ Post reply", "🙈 Skip"]);
    expect(parseReviewCallback(buttons(card)[0].callback_data ?? "")).toMatchObject({ action: "post", version: 3 });
  });

  it("labels the reply type of Claude's draft", () => {
    expect(renderGoogleReviewCard(row()).text).toContain("✍️ Thank-you reply, drafted by Claude:");
    expect(renderGoogleReviewCard(row({ star_rating: 3 })).text).toContain("✍️ Constructive reply, drafted by Claude:");
    expect(renderGoogleReviewCard(row({ draft_source: "staff", acted_by_name: "Ivan" })).text).toContain(
      "✍️ Reply written by Ivan:",
    );
  });

  it("flags a 1–2★ review for service recovery while it is open", () => {
    const open = renderGoogleReviewCard(row({ star_rating: 2 }));
    expect(open.text.split("\n").slice(0, 3)).toEqual([
      GOOGLE_CARD_HEADER,
      "★★☆☆☆ 2/5 · Jane Tan",
      "🛟 SERVICE RECOVERY — reply soon, and follow up with this customer personally if you can identify them.",
    ]);
    expect(open.text).toContain("✍️ Service recovery reply, drafted by Claude:");
    expect(renderGoogleReviewCard(row({ star_rating: 4 })).text).not.toContain("SERVICE RECOVERY");
    expect(
      renderGoogleReviewCard(row({ star_rating: 1, status: "posted", posted_reply: "Sorry", acted_by_name: "Ivan" })).text,
    ).not.toContain("SERVICE RECOVERY");
  });

  it("warns when a recovery reply does not send them to WhatsApp", () => {
    const missing = renderGoogleReviewCard(row({ star_rating: 1, draft_reply: "We're so sorry about the delay." }));
    expect(missing.text).toMatch(/⚠️ Doesn't ask them to WhatsApp us on \+65 8780 5311/);
    const given = renderGoogleReviewCard(
      row({ star_rating: 1, draft_reply: "We're so sorry. Please message us on WhatsApp at +65 8780 5311." }),
    );
    expect(given.text).not.toContain("⚠️");
  });

  it("shows a reopened review with the reply on Google now, which Post replaces", () => {
    const card = renderGoogleReviewCard(
      row({
        star_rating: 2,
        reopened_at: "2026-10-02T08:00:00Z",
        reopened_from_rating: 5,
        google_reply: "Thank you, Jane!",
        draft_reply: "We're sorry it got worse, Jane. Please message us on WhatsApp at +65 8780 5311.",
      }),
    );
    expect(card.text).toContain("🔄 REOPENED — the rating changed from 5★ to 2★ after it was answered.");
    expect(card.text).toContain("💬 Our reply on Google now (posting replaces it):\nThank you, Jane!");
    expect(card.text).toContain("tap Post reply to swap our reply");
    expect(buttons(card)[0].text).toBe("✅ Post reply");
    expect(parseReviewCallback(buttons(card)[0].callback_data ?? "")).toMatchObject({ action: "post" });
  });

  it("says a review was edited when the earlier rating is unknown, and drops the banner once settled", () => {
    const open = renderGoogleReviewCard(row({ reopened_at: "2026-10-02T08:00:00Z", google_reply: "Thanks!" }));
    expect(open.text).toContain("🔄 REOPENED — the reviewer edited this review after it was answered.");
    const skippedBefore = renderGoogleReviewCard(row({ reopened_at: "2026-10-02T08:00:00Z", reopened_from_rating: 4, star_rating: 1 }));
    expect(skippedBefore.text).toContain("🔄 REOPENED — the rating changed from 4★ to 1★.");
    expect(buttons(skippedBefore)[0].text).toBe("✅ Post reply");
    const done = renderGoogleReviewCard(
      row({ reopened_at: "2026-10-02T08:00:00Z", status: "posted", posted_reply: "Sorry", acted_by_name: "Ivan" }),
    );
    expect(done.text).not.toContain("REOPENED");
  });

  it("always fits Telegram's 4096 characters, however much is on it", () => {
    const card = renderGoogleReviewCard(
      row({
        star_rating: 1,
        comment: "x".repeat(5000),
        reopened_at: "2026-10-02T08:00:00Z",
        reopened_from_rating: 5,
        google_reply: "g".repeat(2000),
        draft_reply: `Visit www.mpillow.com, call 9123 4567, email a@b.co, 10% off, full refund ${"y".repeat(1400)}`,
        last_error: "e".repeat(2000),
      }),
    );
    expect(card.text.length).toBeLessThanOrEqual(4096);
    expect(card.text).toContain("Service recovery reply, drafted by Claude");
    expect(card.text).toContain("y".repeat(1400));
  });

  it("has no Post button without a draft and says why", () => {
    const card = renderGoogleReviewCard(row({ draft_reply: null, draft_error: "ANTHROPIC_API_KEY is not set" }));
    expect(card.text).toContain("No draft yet — ANTHROPIC_API_KEY is not set");
    expect(buttons(card).map((b) => b.text)).toEqual(["🙈 Skip"]);
  });

  it("links a posted card to the reviews on Google Maps when the place id is known", () => {
    const posted = row({ status: "posted", posted_reply: "Thanks!", acted_by_name: "Ivan" });
    const before = process.env.GOOGLE_PLACE_ID;
    try {
      delete process.env.GOOGLE_PLACE_ID;
      expect(renderGoogleReviewCard(posted).text).not.toContain("🔗");
      process.env.GOOGLE_PLACE_ID = "ChIJ-test";
      expect(renderGoogleReviewCard(posted).text).toContain(
        "🔗 Check it on Google Maps: https://search.google.com/local/reviews?placeid=ChIJ-test",
      );
    } finally {
      if (before === undefined) delete process.env.GOOGLE_PLACE_ID;
      else process.env.GOOGLE_PLACE_ID = before;
    }
  });

  it("flags a draft that Google may reject", () => {
    const card = renderGoogleReviewCard(row({ draft_reply: "Book at www.mpillow.com for 10% off!" }));
    expect(card.text).toMatch(/⚠️ Contains a link/);
    expect(card.text).toMatch(/⚠️ Mentions a discount/);
  });

  it("drops the buttons once someone has acted", () => {
    const posted = renderGoogleReviewCard(
      row({ status: "posted", posted_reply: "Thanks!", posted_at: "2026-10-01T03:00:00Z", acted_by_name: "Ivan" }),
    );
    expect(posted.replyMarkup).toBeUndefined();
    expect(posted.text).toContain("✅ Replied on Google Maps by Ivan");
    expect(posted.text).toContain("Thanks!");

    expect(renderGoogleReviewCard(row({ status: "skipped", acted_by_name: "Ivan" })).replyMarkup).toBeUndefined();
    expect(renderGoogleReviewCard(row({ status: "posting" })).replyMarkup).toBeUndefined();
    const elsewhere = renderGoogleReviewCard(row({ status: "replied_elsewhere", google_reply: "Owner reply" }));
    expect(elsewhere.replyMarkup).toBeUndefined();
    expect(elsewhere.text).toContain("Owner reply");
  });

  it("names an anonymous reviewer generically and shows reviewer edits", () => {
    const card = renderGoogleReviewCard(
      row({ reviewer_is_anonymous: true, review_updated_at: "2026-10-02T02:00:00Z" }),
    );
    expect(card.text).toContain("· A Google user");
    expect(card.text).toContain("✏️ Edited by the reviewer");
  });

  it("clips a long review to keep the card inside Telegram's limit", () => {
    const card = renderGoogleReviewCard(row({ comment: "x".repeat(5000), draft_reply: "y".repeat(1500) }));
    expect(card.text.length).toBeLessThan(4096);
  });

  it("shows the last failure so the next tap is informed", () => {
    const card = renderGoogleReviewCard(row({ last_error: "Google Business Profile 403: quota" }));
    expect(card.text).toContain("❌ Last attempt failed: Google Business Profile 403: quota");
  });

  it("gains one line with a link when a customer may have written it, and names nobody (CRM slice 12)", () => {
    const url = "https://mpillow.test/settings/customers?view=reviews";
    const card = renderGoogleReviewCard(row(), { possibleCustomerMatch: url });
    const added = card.text.split("\n").filter((l) => !renderGoogleReviewCard(row()).text.split("\n").includes(l));
    expect(added).toEqual([`👤 Possible customer match: confirm in the Admin Panel: ${url}`]);
    expect(card.replyMarkup).toEqual(renderGoogleReviewCard(row()).replyMarkup);
    expect(renderGoogleReviewCard(row(), { possibleCustomerMatch: null }).text).not.toContain("Possible customer match");
  });
});

describe("Google review card read through the Places API", () => {
  const places = (overrides: Partial<GoogleReviewRow> = {}) =>
    row({
      source: "places",
      review_name: "places/ChIJ-test/reviews/r1",
      maps_uri: "https://www.google.com/maps/reviews/data=r1",
      ...overrides,
    });

  it("links to the review and offers Mark replied for the draft on screen, never Post", () => {
    const card = renderGoogleReviewCard(places());
    expect(card.text.split("\n")[0]).toBe(GOOGLE_CARD_HEADER);
    expect(card.text).toContain("post this reply on Google Maps, then tap ✅ Mark replied");
    expect(card.text).toContain("Start a reply with // for a team-only note.");
    expect(card.replyMarkup?.inline_keyboard[0]).toEqual([
      { text: "🔗 Open on Google Maps", url: "https://www.google.com/maps/reviews/data=r1" },
    ]);
    expect(card.replyMarkup?.inline_keyboard[1].map((b) => b.text)).toEqual(["✅ Mark replied", "🙈 Skip"]);
    expect(parseReviewCallback(card.replyMarkup?.inline_keyboard[1][0].callback_data ?? "")).toEqual({
      source: "google",
      action: "done",
      id: ID,
      version: 3,
    });
    expect(buttons(card).map((b) => b.text)).not.toContain("✅ Post reply");
  });

  it("still offers Mark replied without a draft, for wording written on Google Maps", () => {
    const card = renderGoogleReviewCard(places({ draft_reply: null }));
    expect(card.text).toContain("write a reply on Google Maps, then tap ✅ Mark replied");
    expect(buttons(card).map((b) => b.text)).toEqual(["🔗 Open on Google Maps", "✅ Mark replied", "🙈 Skip"]);
  });

  it("says who marked it replied, and links back to the review", () => {
    const card = renderGoogleReviewCard(
      places({ status: "posted", posted_reply: "Thank you, Jane!", acted_by_name: "Ivan", posted_at: "2026-10-02T02:00:00Z" }),
    );
    expect(card.text).toContain("✅ Marked replied on Google Maps by Ivan");
    expect(card.text).toContain("🔗 Check it on Google Maps: https://www.google.com/maps/reviews/data=r1");
    expect(card.replyMarkup).toBeUndefined();
  });

  it("closes an expired card without quoting the review", () => {
    const text = renderExpiredPlacesCard(places());
    expect(text).toContain("⌛ This card closed after 30 days");
    expect(text).toContain("https://www.google.com/maps/reviews/data=r1");
    expect(text).not.toContain("Best pillow");
  });

  it("announces reviews the five Places returns did not include", () => {
    expect(renderMissedReviewsNotice(1, "https://maps.google.com/?cid=1")).toBe(
      "⭐ 1 new Google review didn't come through as a card: the Places API shows only five reviews, picked by relevance.\nRead and answer on Google Maps: https://maps.google.com/?cid=1",
    );
    expect(renderMissedReviewsNotice(2, "https://maps.google.com/?cid=1")).toMatch(/^⭐ 2 new Google reviews /);
  });
});

describe("shop review card", () => {
  const shop = {
    id: ID,
    author_name: "Ada L.",
    rating: 4,
    title: "Comfy",
    body: "Neck feels better",
    status: "pending" as const,
    created_at: "2026-10-01T02:00:00Z",
    productName: "Mpillow Basic",
    store_reply: null,
    store_reply_at: null,
    store_reply_by_name: null,
  };
  const replied = {
    store_reply: "Thank you, Ada! Glad your neck feels better.",
    store_reply_at: "2026-10-02T03:30:00Z",
    store_reply_by_name: "Sam",
  };
  const callbacks = (card: ReturnType<typeof renderShopReviewCard>) =>
    buttons(card).map((b) => parseReviewCallback(b.callback_data ?? ""));

  it("is clearly a website review: approve/reject, and how to reply", () => {
    const card = renderShopReviewCard(shop);
    expect(card.text.split("\n")[0]).toBe(SHOP_CARD_HEADER);
    expect(card.text).toContain("Product: Mpillow Basic");
    expect(card.text).toContain("reply to this message with our reply. It shows under the review once the review is approved.");
    expect(card.text).toContain("Start a reply with // for a team-only note.");
    expect(callbacks(card)).toEqual([
      { source: "shop", action: "approve", id: ID },
      { source: "shop", action: "reject", id: ID },
    ]);
  });

  it("records who decided, and an approved card without a reply still says how to answer", () => {
    const card = renderShopReviewCard({ ...shop, status: "approved" }, "Ivan");
    expect(card.replyMarkup).toBeUndefined();
    expect(card.text).toContain("✅ Approved by Ivan");
    expect(card.text).toContain("It shows under the review on the product page.");
  });

  it("shows our reply on a pending review, with Remove reply beside Approve / Reject", () => {
    const card = renderShopReviewCard({ ...shop, ...replied });
    expect(card.text).toContain("💬 Our reply, by Sam · 2 Oct 2026, 11:30 am. It shows under the review once the review is approved:");
    expect(card.text).toContain("Thank you, Ada! Glad your neck feels better.");
    expect(card.text).toContain("Reply to this message to change our reply.");
    expect(callbacks(card)).toEqual([
      { source: "shop", action: "approve", id: ID },
      { source: "shop", action: "reject", id: ID },
      { source: "shop", action: "unreply", id: ID },
    ]);
  });

  it("shows our reply live on an approved review, with only Remove reply", () => {
    const card = renderShopReviewCard({ ...shop, ...replied, status: "approved" });
    expect(card.text).toContain("✅ Approved — shown on the product page.");
    expect(card.text).toContain("💬 Our reply on the product page, by Sam · 2 Oct 2026, 11:30 am:");
    expect(buttons(card).map((b) => b.text)).toEqual(["🗑 Remove reply"]);
  });

  it("offers nothing on a rejected review, and says a reply is hidden with it", () => {
    expect(renderShopReviewCard({ ...shop, status: "rejected" }, "Ivan")).toEqual({
      text: expect.stringContaining("🚫 Rejected by Ivan — hidden from the shop."),
    });
    const card = renderShopReviewCard({ ...shop, ...replied, status: "rejected" });
    expect(card.replyMarkup).toBeUndefined();
    expect(card.text).toContain("💬 Our reply, by Sam · 2 Oct 2026, 11:30 am, hidden with the review:");
  });

  it("fits Telegram's limit at every field's maximum", () => {
    const card = renderShopReviewCard({
      ...shop,
      author_name: "A".repeat(200),
      title: "T".repeat(300),
      body: "B".repeat(5000),
      store_reply: "R".repeat(1500),
      store_reply_at: replied.store_reply_at,
      store_reply_by_name: "N".repeat(100),
    });
    expect(card.text.length).toBeLessThanOrEqual(4096);
  });
});

describe("starLine", () => {
  it("renders 1–5 and tolerates a missing rating", () => {
    expect(starLine(1)).toBe("★☆☆☆☆ 1/5");
    expect(starLine(null)).toBe("No star rating");
  });
});
