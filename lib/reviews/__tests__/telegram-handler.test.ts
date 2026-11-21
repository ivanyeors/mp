import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, GOOGLE_REVIEW_DEFAULTS, type Row } from "./fake-supabase";
import { hashLinkCode } from "@/lib/telegram/link-codes";
import {
  GOOGLE_CARD_HEADER,
  PREVIEW_CARD_PREFIX,
  PREVIEW_REVIEW_ID,
  SHOP_CARD_HEADER,
  encodeReviewCallback,
} from "@/lib/reviews/cards";

const GROUP = -1001279910218;
const REVIEW_ID = "3f2b7c1e-8a4d-4e9b-9c11-0123456789ab";
const SHOP_ID = "5a5a5a5a-1111-4222-8333-444455556666";
const IVAN = { id: 111, first_name: "Ivan", username: "ivan" };
const SAM = { id: 222, first_name: "Sam" };
const STRANGER = { id: 999, first_name: "Who" };
const REPLY = "telegram.google-review-reply";
const MODERATE = "telegram.shop-review-moderate";
const SHOP_REPLY = "telegram.shop-review-reply";
const SHOP_CARD = 88;

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  updateReply: vi.fn(),
  draft: vi.fn(),
  answerCallback: vi.fn(),
  editGroupCard: vi.fn(),
  deleteGroupMessage: vi.fn(),
  replyInGroup: vi.fn(),
  replyInChat: vi.fn(),
  sendGroupCard: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));
vi.mock("@/lib/telegram/bot-api", () => ({
  answerCallback: h.answerCallback,
  editGroupCard: h.editGroupCard,
  deleteGroupMessage: h.deleteGroupMessage,
  replyInGroup: h.replyInGroup,
  replyInChat: h.replyInChat,
  sendGroupCard: h.sendGroupCard,
}));
vi.mock("@/lib/reviews/draft-reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/reviews/draft-reply")>()),
  draftReviewReply: h.draft,
}));
vi.mock("@/lib/google/business-profile", async (orig) => ({
  ...(await orig<typeof import("@/lib/google/business-profile")>()),
  getBusinessProfileConfig: () => ({ location: "accounts/1/locations/2", clientId: "c", clientSecret: "s", refreshToken: "r" }),
  businessProfileClientFromConfig: () => ({ updateReply: h.updateReply, listReviews: vi.fn(), getReview: vi.fn() }),
}));

const { handleReviewUpdate, isReviewUpdate } = await import("@/lib/reviews/telegram-handler");
const { notifyNewShopReview } = await import("@/lib/reviews/shop-reviews");
const { resetRateLimits } = await import("@/lib/rate-limit");

const reviews = () => h.tables.google_reviews as Row[];
const review = () => reviews()[0];

function tap(from: { id: number }, data: string) {
  return handleReviewUpdate({
    callback_query: { id: "cq1", from, data, message: { message_id: 77, chat: { id: GROUP } } },
  });
}

function say(from: { id: number }, text: string, opts: { replyTo?: number; chat?: number; replyText?: string } = {}) {
  return handleReviewUpdate({
    message: {
      message_id: 500,
      chat: { id: opts.chat ?? GROUP },
      from,
      text,
      ...(opts.replyTo
        ? { reply_to_message: { message_id: opts.replyTo, text: opts.replyText ?? `${GOOGLE_CARD_HEADER}\n…` } }
        : {}),
    },
  });
}

const post = (version = 2) => encodeReviewCallback({ source: "google", action: "post", id: REVIEW_ID, version });
const lastAlert = () => h.answerCallback.mock.calls.at(-1);
const lastEditText = () => String(h.editGroupCard.mock.calls.at(-1)?.[1] ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  h.updateReply.mockResolvedValue({ comment: "Thanks, Jane!", updateTime: "2026-10-02T08:00:00Z" });
  h.deleteGroupMessage.mockResolvedValue(true);
  h.tables = {
    admin_roles: [
      { id: "r-owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-shop", name: "Shop desk", grants_all: false, permissions: ["orders", MODERATE] },
    ],
    admin_users: [
      { id: "m-sg", email: "sg@mpillow.com", role_id: "r-owner", is_active: true, auth_user_id: "u-sg" },
      { id: "m-shop", email: "shop@x.test", role_id: "r-shop", is_active: true, auth_user_id: "u-shop" },
    ],
    mp_staff: [
      { id: "p-ivan", name: "Ivan", admin_user_id: "m-sg", archived_at: null },
      { id: "p-sam", name: "Sam", admin_user_id: "m-shop", archived_at: null },
      { id: "p-nadia", name: "Nadia", admin_user_id: "m-sg", archived_at: null },
    ],
    telegram_operators: [
      { id: "op-ivan", staff_profile_id: "p-ivan", actions: [REPLY, MODERATE], is_active: true, telegram_user_id: IVAN.id },
      { id: "op-sam", staff_profile_id: "p-sam", actions: [MODERATE], is_active: true, telegram_user_id: SAM.id },
      {
        id: "op-new",
        staff_profile_id: "p-nadia",
        actions: [REPLY, MODERATE],
        is_active: true,
        telegram_user_id: null,
        link_code_hash: hashLinkCode("K7Q2MX9P"),
        link_code_expires_at: "2999-01-01T00:00:00Z",
      },
    ],
    google_reviews: [
      {
        ...GOOGLE_REVIEW_DEFAULTS,
        id: REVIEW_ID,
        review_name: "accounts/1/locations/2/reviews/abc",
        status: "pending",
        star_rating: 5,
        comment: "Great fit",
        reviewer_name: "Jane",
        draft_reply: "Thanks, Jane!",
        draft_source: "claude",
        draft_version: 2,
        telegram_chat_id: GROUP,
        telegram_message_id: 77,
      },
    ],
    product_reviews: [
      {
        id: SHOP_ID,
        product_id: "p1",
        author_name: "Ada L.",
        rating: 4,
        title: null,
        body: "Comfy",
        status: "pending",
        created_at: "2026-10-01T00:00:00Z",
        store_reply: null,
        store_reply_at: null,
        store_reply_by_name: null,
        telegram_chat_id: GROUP,
        telegram_message_id: SHOP_CARD,
      },
    ],
    products: [{ id: "p1", slug: "mpillow-basic", content: { "en-US": { title: "Mpillow Basic" } } }],
  };
  h.db = createFakeSupabase(h.tables);
});

describe("isReviewUpdate", () => {
  it("claims review buttons, /link and replies to a Google card in the group — nothing else", () => {
    expect(isReviewUpdate({ callback_query: { id: "1", from: IVAN, data: post() } })).toBe(true);
    expect(isReviewUpdate({ callback_query: { id: "1", from: IVAN, data: "pill:XS" } })).toBe(false);
    const msg = (text: string, extra = {}) => ({ message: { message_id: 1, chat: { id: GROUP }, from: IVAN, text, ...extra } });
    expect(isReviewUpdate(msg("/link ABC"))).toBe(true);
    expect(isReviewUpdate(msg("/link@mpillow_bot ABC"))).toBe(true);
    expect(isReviewUpdate(msg("/stock"))).toBe(false);
    const card = { reply_to_message: { message_id: 77, text: `${GOOGLE_CARD_HEADER}\n…` } };
    expect(isReviewUpdate(msg("Thanks so much!", card))).toBe(true);
    expect(isReviewUpdate(msg("// shall we offer a refit?", card))).toBe(true);
    const preview = { reply_to_message: { message_id: 78, text: `${PREVIEW_CARD_PREFIX}a 5★ review.\n${GOOGLE_CARD_HEADER}\n…` } };
    expect(isReviewUpdate(msg("Thanks so much!", preview))).toBe(true);
    expect(isReviewUpdate(msg("/help", card))).toBe(false);
    const shopCard = { reply_to_message: { message_id: SHOP_CARD, text: `${SHOP_CARD_HEADER}\n…` } };
    expect(isReviewUpdate(msg("Thank you, Ada!", shopCard))).toBe(true);
    expect(isReviewUpdate(msg("// approve once the photo checks out", shopCard))).toBe(true);
    expect(isReviewUpdate(msg("/stock", shopCard))).toBe(false);
    const shopPreview = { reply_to_message: { message_id: 79, text: `${PREVIEW_CARD_PREFIX}a new shop review.\n${SHOP_CARD_HEADER}\n…` } };
    expect(isReviewUpdate(msg("Thanks!", shopPreview))).toBe(true);
    expect(isReviewUpdate({ message: { message_id: 1, chat: { id: 42 }, from: IVAN, text: "hi", ...card } })).toBe(false);
    expect(isReviewUpdate(msg("12", { reply_to_message: { message_id: 9, text: "Enter quantity for OUT" } }))).toBe(false);
  });
});

describe("RBAC on review buttons", () => {
  it("tells an unlinked person how to get access, with their Telegram ID", async () => {
    await tap(STRANGER, post());
    expect(lastAlert()).toEqual(["cq1", expect.stringContaining("Your Telegram ID: 999"), true]);
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(review().status).toBe("pending");
  });

  it("does not let someone whose login role lacks Google replies reply on Google", async () => {
    await tap(SAM, post());
    expect(lastAlert()?.[1]).toBe(
      `Your login's role (Shop desk) doesn't include "reply to google reviews". Ask an Owner to turn it on under Users & permissions → Roles.`,
    );
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("needs the action on the link too, even when the role allows it", async () => {
    h.tables.telegram_operators[0].actions = [MODERATE];
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/Your Telegram access doesn't include "reply to google reviews"/);
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("refuses when the login is deactivated, with the login reason", async () => {
    h.tables.admin_users[0].is_active = false;
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/Admin Panel login is deactivated/);
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("refuses an Invited login that hasn't signed in yet", async () => {
    h.tables.admin_users[0].auth_user_id = null;
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/hasn't been accepted yet/);
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("refuses an archived staff profile", async () => {
    h.tables.mp_staff[0].archived_at = "2026-10-01T00:00:00Z";
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/staff profile is archived/);
  });

  it("refuses when the role's permissions cannot be read", async () => {
    h.tables.admin_roles = [];
    h.db = createFakeSupabase(h.tables);
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/Your login's role doesn't include/);
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("follows a role change on the next tap", async () => {
    h.tables.admin_roles[1].permissions = ["orders"];
    await tap(SAM, encodeReviewCallback({ source: "shop", action: "approve", id: SHOP_ID }));
    expect(lastAlert()?.[1]).toMatch(/Shop desk/);
    expect(h.tables.product_reviews[0].status).toBe("pending");
  });

  it("refuses a switched-off operator", async () => {
    (h.tables.telegram_operators[0] as Row).is_active = false;
    await tap(IVAN, post());
    expect(lastAlert()?.[1]).toMatch(/switched off/);
    expect(h.updateReply).not.toHaveBeenCalled();
  });

  it("ignores taps from another chat", async () => {
    await handleReviewUpdate({
      callback_query: { id: "cq1", from: IVAN, data: post(), message: { message_id: 77, chat: { id: 42 } } },
    });
    expect(h.updateReply).not.toHaveBeenCalled();
  });
});

describe("Post reply", () => {
  it("publishes the draft on screen and records who did it", async () => {
    await tap(IVAN, post(2));
    expect(h.updateReply).toHaveBeenCalledWith("accounts/1/locations/2/reviews/abc", "Thanks, Jane!");
    expect(review()).toMatchObject({
      status: "posted",
      posted_reply: "Thanks, Jane!",
      acted_by_name: "Ivan",
      acted_by_telegram_user_id: IVAN.id,
    });
    expect(lastEditText()).toContain("✅ Replied on Google Maps by Ivan");
    expect(h.editGroupCard.mock.calls.at(-1)?.[2]).toBeUndefined();
  });

  it("refuses a tap on a draft that has since changed", async () => {
    await tap(IVAN, post(1));
    expect(lastAlert()?.[1]).toMatch(/draft just changed/);
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(review().status).toBe("pending");
  });

  it("posts once however many times it is tapped", async () => {
    await tap(IVAN, post(2));
    await tap(IVAN, post(2));
    expect(h.updateReply).toHaveBeenCalledOnce();
    expect(lastAlert()?.[1]).toMatch(/already dealt with/);
  });

  it("hands the card back with the error when Google refuses", async () => {
    h.updateReply.mockRejectedValueOnce(new Error("Google Business Profile 400: reply violates policy"));
    await tap(IVAN, post(2));
    expect(review()).toMatchObject({ status: "pending", last_error: expect.stringMatching(/violates policy/) });
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/❌ Google did not take the reply/), 77);
    expect(lastEditText()).toContain("❌ Last attempt failed");
  });
});

describe("preview cards", () => {
  const preview = (action: "post" | "approve") =>
    action === "post"
      ? encodeReviewCallback({ source: "google", action: "post", id: PREVIEW_REVIEW_ID, version: 1 })
      : encodeReviewCallback({ source: "shop", action: "approve", id: PREVIEW_REVIEW_ID });

  it("tells a set-up review manager they are set up, and does nothing", async () => {
    await tap(IVAN, preview("post"));
    expect(lastAlert()).toEqual([
      "cq1",
      "✅ You're set up as Ivan (Reply to Google reviews, Moderate shop reviews). On a real review, this button would publish the reply on Google Maps.",
      true,
    ]);
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(h.editGroupCard).not.toHaveBeenCalled();
    expect(review().status).toBe("pending");
  });

  it("runs the real permission check first", async () => {
    await tap(STRANGER, preview("post"));
    expect(lastAlert()?.[1]).toContain("Your Telegram ID: 999");
    await tap(SAM, preview("post"));
    expect(lastAlert()?.[1]).toMatch(/Shop desk/);
    await tap(SAM, preview("approve"));
    expect(lastAlert()?.[1]).toBe(
      "✅ You're set up as Sam (Moderate shop reviews). On a real review, this button would show the review on the product page.",
    );
    expect(h.tables.product_reviews[0].status).toBe("pending");
  });
});

describe("Skip and staff wording", () => {
  const skip = encodeReviewCallback({ source: "google", action: "skip", id: REVIEW_ID });

  it("skips without posting and removes the card", async () => {
    await tap(IVAN, skip);
    expect(review()).toMatchObject({ status: "skipped", acted_by_name: "Ivan" });
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(h.deleteGroupMessage).toHaveBeenCalledWith(77);
    expect(h.editGroupCard).not.toHaveBeenCalled();
  });

  it("marks the card skipped when Telegram will not delete it", async () => {
    h.deleteGroupMessage.mockResolvedValue(false);
    await tap(IVAN, skip);
    expect(review().status).toBe("skipped");
    expect(lastEditText()).toContain("🙈 Skipped by Ivan");
  });

  it("explains a reply to a preview card instead of saving it", async () => {
    await say(IVAN, "My own wording", { replyTo: 78, replyText: `${PREVIEW_CARD_PREFIX}a 5★ review.\n${GOOGLE_CARD_HEADER}\n…` });
    expect(review().draft_reply).toBe("Thanks, Jane!");
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/On a real card.*Ivan \(Reply to Google reviews, Moderate shop reviews\)/), 500);
  });

  it("takes a review manager's reply to the card as the new draft — Post still required", async () => {
    await say(IVAN, "Thank you Jane, see you at your adjustment!", { replyTo: 77 });
    expect(review()).toMatchObject({
      status: "pending",
      draft_reply: "Thank you Jane, see you at your adjustment!",
      draft_source: "staff",
      draft_version: 3,
    });
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/Draft updated/), 500);
    expect(lastEditText()).toContain("written by Ivan");
  });

  it("ignores chatter under a card from people who are not set up", async () => {
    await say(STRANGER, "Nice one!", { replyTo: 77 });
    expect(review().draft_reply).toBe("Thanks, Jane!");
    expect(h.replyInGroup).not.toHaveBeenCalled();
  });

  it("leaves a // team note under the card alone — the draft stays, and nobody is answered", async () => {
    await say(IVAN, "// shall we offer her a refit visit?", { replyTo: 77 });
    await say(STRANGER, "//agree", { replyTo: 77 });
    expect(review()).toMatchObject({ draft_reply: "Thanks, Jane!", draft_version: 2, draft_source: "claude" });
    expect(h.replyInGroup).not.toHaveBeenCalled();
    expect(h.editGroupCard).not.toHaveBeenCalled();
  });

  it("tells a linked person without Google replies they can't change them", async () => {
    await say(SAM, "Thanks!", { replyTo: 77 });
    expect(review().draft_reply).toBe("Thanks, Jane!");
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/doesn't include "reply to google reviews"/), 500);
  });
});

describe("Mark replied, for a review read through the Places API", () => {
  const done = (version = 2) => encodeReviewCallback({ source: "google", action: "done", id: REVIEW_ID, version });

  beforeEach(() => {
    Object.assign(review(), {
      source: "places",
      review_name: "places/ChIJ-test/reviews/abc",
      maps_uri: "https://www.google.com/maps/reviews/data=abc",
    });
  });

  it("records the draft on screen as posted, by whom — and never calls Google", async () => {
    await tap(IVAN, done(2));
    expect(review()).toMatchObject({ status: "posted", posted_reply: "Thanks, Jane!", acted_by_name: "Ivan" });
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(lastAlert()).toEqual(["cq1", "Marked replied.", false]);
    expect(lastEditText()).toContain("✅ Marked replied on Google Maps by Ivan");
  });

  it("refuses a draft that changed since the card was drawn", async () => {
    await tap(IVAN, done(1));
    expect(lastAlert()?.[1]).toMatch(/draft just changed/);
    expect(review().status).toBe("pending");
  });

  it("needs the same permission as Post", async () => {
    await tap(SAM, done(2));
    expect(lastAlert()?.[1]).toMatch(/Shop desk/);
    expect(review().status).toBe("pending");
  });

  it("refuses Post on a Places review, and says what to do instead", async () => {
    await tap(IVAN, post(2));
    expect(lastAlert()?.[1]).toBe(
      "This review came through the Places API, which can't post. Reply on Google Maps, then tap Mark replied.",
    );
    expect(h.updateReply).not.toHaveBeenCalled();
    expect(review().status).toBe("pending");
  });

  it("points at Post reply once the Business Profile API has adopted the review", async () => {
    review().source = "business_profile";
    await tap(IVAN, done(2));
    expect(lastAlert()?.[1]).toMatch(/use Post reply on the updated card/);
    expect(review().status).toBe("pending");
  });
});

describe("shop review moderation", () => {
  const approve = encodeReviewCallback({ source: "shop", action: "approve", id: SHOP_ID });

  it("approves once, by a shop moderator, and says who", async () => {
    await tap(SAM, approve);
    expect(h.tables.product_reviews[0].status).toBe("approved");
    expect(lastEditText()).toContain("✅ Approved by Sam");

    await tap(SAM, encodeReviewCallback({ source: "shop", action: "reject", id: SHOP_ID }));
    expect(h.tables.product_reviews[0].status).toBe("approved");
    expect(lastAlert()?.[1]).toBe("Already approved.");
  });

  it("refuses a stranger", async () => {
    await tap(STRANGER, approve);
    expect(h.tables.product_reviews[0].status).toBe("pending");
  });

  it("records the tapped card, so a card sent before card ids were kept can be replied to", async () => {
    Object.assign(h.tables.product_reviews[0], { telegram_chat_id: null, telegram_message_id: null });
    await tap(SAM, approve);
    expect(h.tables.product_reviews[0]).toMatchObject({ telegram_chat_id: GROUP, telegram_message_id: 77 });
  });

  it("keeps the new card's message id when the card goes out", async () => {
    Object.assign(h.tables.product_reviews[0], { telegram_chat_id: null, telegram_message_id: null });
    h.sendGroupCard.mockResolvedValue({ chatId: GROUP, messageId: 4242 });
    await notifyNewShopReview(SHOP_ID);
    expect(h.sendGroupCard).toHaveBeenCalledWith(expect.stringContaining(SHOP_CARD_HEADER), expect.anything());
    expect(h.tables.product_reviews[0]).toMatchObject({ telegram_chat_id: GROUP, telegram_message_id: 4242 });
  });
});

describe("our reply under a shop review", () => {
  const shopReview = () => h.tables.product_reviews[0] as Row;
  const replyToCard = (from: { id: number }, text: string) =>
    say(from, text, { replyTo: SHOP_CARD, replyText: `${SHOP_CARD_HEADER}\n…` });
  const tapCard = (from: { id: number }, data: string) =>
    handleReviewUpdate({
      callback_query: { id: "cq1", from, data, message: { message_id: SHOP_CARD, chat: { id: GROUP } } },
    });
  const unreply = encodeReviewCallback({ source: "shop", action: "unreply", id: SHOP_ID });

  beforeEach(() => {
    h.tables.telegram_operators[0].actions = [REPLY, MODERATE, SHOP_REPLY];
  });

  it("sets it from a reply to a pending review's card, says it waits for approval, and redraws the card", async () => {
    await replyToCard(IVAN, "“Thank you, Ada! Glad the cover suits you.”");
    expect(shopReview()).toMatchObject({
      status: "pending",
      store_reply: "Thank you, Ada! Glad the cover suits you.",
      store_reply_by_name: "Ivan",
      store_reply_at: expect.any(String),
    });
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/Reply saved — it shows under the review once the review is approved/), 500);
    expect(h.editGroupCard.mock.calls.at(-1)?.[0]).toBe(SHOP_CARD);
    expect(lastEditText()).toContain("💬 Our reply, by Ivan");
    expect(lastEditText()).toContain("Thank you, Ada! Glad the cover suits you.");
    const buttons = (h.editGroupCard.mock.calls.at(-1)?.[2] as { inline_keyboard: { text: string }[][] }).inline_keyboard.flat();
    expect(buttons.map((b) => b.text)).toEqual(["✅ Approve", "🚫 Reject", "🗑 Remove reply"]);
  });

  it("goes live on an approved review, and a second reply replaces the first", async () => {
    shopReview().status = "approved";
    await replyToCard(IVAN, "Thanks, Ada!");
    await replyToCard(IVAN, "Thank you, Ada — enjoy the sleep!");
    expect(shopReview().store_reply).toBe("Thank you, Ada — enjoy the sleep!");
    expect(h.replyInGroup).toHaveBeenLastCalledWith(expect.stringMatching(/Reply posted — it's under the review on the product page/), 500);
    expect(lastEditText()).toContain("💬 Our reply on the product page, by Ivan");
  });

  it("changes nothing on a rejected review, and says so", async () => {
    shopReview().status = "rejected";
    await replyToCard(IVAN, "Thanks, Ada!");
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).toHaveBeenCalledWith("❌ This review was rejected, so it isn't on the shop — nothing changed.", 500);
  });

  it("refuses a reply over the length limit", async () => {
    await replyToCard(IVAN, "x".repeat(1501));
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/^❌ The reply is 1501 characters/), 500);
  });

  it("needs its own action: a shop moderator is told, a stranger is ignored", async () => {
    await replyToCard(SAM, "Thanks!");
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/Shop desk\) doesn't include "reply to shop reviews"/), 500);

    h.replyInGroup.mockClear();
    await replyToCard(STRANGER, "Nice one!");
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).not.toHaveBeenCalled();
  });

  it("needs the action on the link too, even when the role allows it", async () => {
    h.tables.telegram_operators[0].actions = [REPLY, MODERATE];
    await replyToCard(IVAN, "Thanks, Ada!");
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/Your Telegram access doesn't include "reply to shop reviews"/), 500);
  });

  it("leaves a // team note under the card alone", async () => {
    await replyToCard(IVAN, "// shall we thank her for the photo too?");
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).not.toHaveBeenCalled();
    expect(h.editGroupCard).not.toHaveBeenCalled();
  });

  it("ignores a reply to a shop card it has no review for", async () => {
    await say(IVAN, "Thanks!", { replyTo: 12345, replyText: `${SHOP_CARD_HEADER}\n…` });
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).not.toHaveBeenCalled();
  });

  it("explains a reply to a shop preview card instead of saving it", async () => {
    await say(IVAN, "Thanks!", { replyTo: 79, replyText: `${PREVIEW_CARD_PREFIX}a new shop review.\n${SHOP_CARD_HEADER}\n…` });
    expect(shopReview().store_reply).toBeNull();
    expect(h.replyInGroup).toHaveBeenCalledWith(
      expect.stringMatching(/our public reply under the review on the product page.*Ivan \(Reply to Google reviews, Moderate shop reviews, Reply to shop reviews\)/),
      500,
    );
  });

  it("Remove reply takes it down once, and needs the reply action", async () => {
    Object.assign(shopReview(), { status: "approved", store_reply: "Thanks, Ada!", store_reply_at: "2026-10-02T00:00:00Z", store_reply_by_name: "Ivan" });

    await tapCard(SAM, unreply);
    expect(lastAlert()?.[1]).toMatch(/Shop desk\) doesn't include "reply to shop reviews"/);
    expect(shopReview().store_reply).toBe("Thanks, Ada!");

    await tapCard(IVAN, unreply);
    expect(shopReview()).toMatchObject({ store_reply: null, store_reply_at: null, store_reply_by_name: null });
    expect(lastAlert()).toEqual(["cq1", "Reply removed — it's gone from the product page.", false]);
    expect(lastEditText()).not.toContain("Our reply");
    expect(h.editGroupCard.mock.calls.at(-1)?.[2]).toBeUndefined();

    await tapCard(IVAN, unreply);
    expect(lastAlert()).toEqual(["cq1", "There's no reply to remove — check the updated card.", true]);
  });

  it("a Remove reply tap on a preview card only reports access", async () => {
    await tapCard(IVAN, encodeReviewCallback({ source: "shop", action: "unreply", id: PREVIEW_REVIEW_ID }));
    expect(lastAlert()?.[1]).toMatch(/On a real review, this button would remove our reply from under the review on the product page\./);
    expect(h.editGroupCard).not.toHaveBeenCalled();
  });
});

describe("/link", () => {
  it("binds the sender to the code's person, once", async () => {
    await say({ id: 333, username: "nadia" } as { id: number }, "/link k7q2-mx9p", { chat: 333 });
    const nadia = h.tables.telegram_operators[2];
    expect(nadia).toMatchObject({ telegram_user_id: 333, telegram_username: "nadia", link_code_hash: null });
    expect(h.replyInChat).toHaveBeenCalledWith(333, expect.stringContaining("✅ Linked"), 500);

    await say({ id: 444 }, "/link K7Q2MX9P", { chat: 444 });
    expect(h.replyInChat).toHaveBeenLastCalledWith(444, expect.stringMatching(/isn't valid/), 500);
  });

  it("names what the person can do now, not just what the link lists", async () => {
    h.tables.mp_staff[2].admin_user_id = "m-shop";
    await say({ id: 333 }, "/link K7Q2MX9P", { chat: 333 });
    const text = h.replyInChat.mock.calls.at(-1)?.[1] as string;
    expect(text).toMatch(/You're set up as Nadia \(Moderate shop reviews\)/);
    expect(text).not.toMatch(/Reply to Google/);
  });

  it("says so when the freshly linked login can't act yet", async () => {
    h.tables.admin_users[0].is_active = false;
    await say({ id: 333 }, "/link K7Q2MX9P", { chat: 333 });
    expect(h.replyInChat).toHaveBeenLastCalledWith(
      333,
      expect.stringMatching(/Linked as Nadia, but you can't act on cards yet.*deactivated/),
      500,
    );
  });

  it("refuses an expired code", async () => {
    h.tables.telegram_operators[2].link_code_expires_at = "2020-01-01T00:00:00Z";
    await say({ id: 333 }, "/link K7Q2MX9P", { chat: 333 });
    expect(h.replyInChat).toHaveBeenLastCalledWith(333, expect.stringMatching(/expired/), 500);
    expect(h.tables.telegram_operators[2].telegram_user_id).toBeNull();
  });

  it("will not give one Telegram account two identities", async () => {
    await say(IVAN, "/link K7Q2MX9P");
    expect(h.replyInChat).toHaveBeenLastCalledWith(GROUP, expect.stringMatching(/already linked to Ivan/), 500);
  });

  it("rate-limits guessing", async () => {
    for (let i = 0; i < 6; i += 1) await say({ id: 555 }, "/link AAAAAAAA", { chat: 555 });
    expect(h.replyInChat).toHaveBeenLastCalledWith(555, expect.stringMatching(/Too many attempts/), 500);
  });
});
