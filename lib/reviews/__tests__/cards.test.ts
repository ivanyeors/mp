import { describe, expect, it } from "vitest";
import {
  GOOGLE_CARD_HEADER,
  SHOP_CARD_HEADER,
  encodeReviewCallback,
  parseReviewCallback,
  renderGoogleReviewCard,
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
    { source: "google", action: "redraft", id: ID },
    { source: "google", action: "skip", id: ID },
    { source: "shop", action: "approve", id: ID },
    { source: "shop", action: "reject", id: ID },
  ];

  it.each(cases)("round-trips %o inside Telegram's 64 bytes", (cb) => {
    const data = encodeReviewCallback(cb);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseReviewCallback(data)).toEqual(cb);
  });

  it("rejects anything else, including the inventory bot's callbacks", () => {
    for (const data of ["pill:XS", "rv:g:post:not-a-uuid:1", `rv:g:post:${ID}`, `rv:g:delete:${ID}`, `rv:s:approve:${ID}:1`, ""]) {
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
    expect(buttons(card).map((b) => b.text)).toEqual(["✅ Post reply", "🔁 Redraft", "🙈 Skip"]);
    expect(parseReviewCallback(buttons(card)[0].callback_data)).toMatchObject({ action: "post", version: 3 });
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

  it("has no Post button without a draft and says why", () => {
    const card = renderGoogleReviewCard(row({ draft_reply: null, draft_error: "ANTHROPIC_API_KEY is not set" }));
    expect(card.text).toContain("No draft yet — ANTHROPIC_API_KEY is not set");
    expect(buttons(card).map((b) => b.text)).toEqual(["🔁 Redraft", "🙈 Skip"]);
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
  };

  it("is clearly a website review with approve/reject only", () => {
    const card = renderShopReviewCard(shop);
    expect(card.text.split("\n")[0]).toBe(SHOP_CARD_HEADER);
    expect(card.text).toContain("Product: Mpillow Basic");
    expect(card.text).toContain("no public reply");
    expect(buttons(card).map((b) => parseReviewCallback(b.callback_data))).toEqual([
      { source: "shop", action: "approve", id: ID },
      { source: "shop", action: "reject", id: ID },
    ]);
  });

  it("records who decided", () => {
    const card = renderShopReviewCard({ ...shop, status: "approved" }, "Ivan");
    expect(card.replyMarkup).toBeUndefined();
    expect(card.text).toContain("✅ Approved by Ivan");
  });
});

describe("starLine", () => {
  it("renders 1–5 and tolerates a missing rating", () => {
    expect(starLine(1)).toBe("★☆☆☆☆ 1/5");
    expect(starLine(null)).toBe("No star rating");
  });
});
