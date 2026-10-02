import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, GOOGLE_REVIEW_DEFAULTS, type Row } from "./fake-supabase";
import { hashLinkCode } from "@/lib/telegram/link-codes";
import { GOOGLE_CARD_HEADER, encodeReviewCallback } from "@/lib/reviews/cards";

/**
 * The Telegram side of review cards: who may press what (RBAC), that a Post
 * publishes exactly the draft on screen and only once, staff edits by reply,
 * shop moderation, and binding a Telegram account with /link.
 */

const GROUP = -1001279910218;
const REVIEW_ID = "3f2b7c1e-8a4d-4e9b-9c11-0123456789ab";
const SHOP_ID = "5a5a5a5a-1111-4222-8333-444455556666";
const IVAN = { id: 111, first_name: "Ivan", username: "ivan" };
const SAM = { id: 222, first_name: "Sam" };
const STRANGER = { id: 999, first_name: "Who" };

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  updateReply: vi.fn(),
  draft: vi.fn(),
  answerCallback: vi.fn(),
  editGroupCard: vi.fn(),
  replyInGroup: vi.fn(),
  replyInChat: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));
vi.mock("@/lib/telegram/bot-api", () => ({
  answerCallback: h.answerCallback,
  editGroupCard: h.editGroupCard,
  replyInGroup: h.replyInGroup,
  replyInChat: h.replyInChat,
  sendGroupCard: vi.fn(),
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
  h.draft.mockResolvedValue({ ok: true, reply: "A fresh draft from Claude.", model: "claude-opus-5-5" });
  h.tables = {
    telegram_operators: [
      { id: "op-ivan", display_name: "Ivan", role: "review_manager", is_active: true, telegram_user_id: IVAN.id },
      { id: "op-sam", display_name: "Sam", role: "shop_moderator", is_active: true, telegram_user_id: SAM.id },
      {
        id: "op-new",
        display_name: "Nadia",
        role: "review_manager",
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
      { id: SHOP_ID, product_id: "p1", author_name: "Ada L.", rating: 4, title: null, body: "Comfy", status: "pending", created_at: "2026-10-01T00:00:00Z" },
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
    expect(isReviewUpdate(msg("/help", card))).toBe(false);
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

  it("does not let a shop moderator reply on Google", async () => {
    await tap(SAM, post());
    expect(lastAlert()?.[1]).toMatch(/Only review managers/);
    expect(h.updateReply).not.toHaveBeenCalled();
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

describe("Redraft, Skip and staff wording", () => {
  it("replaces the draft with Claude's new one and bumps the version", async () => {
    await tap(IVAN, encodeReviewCallback({ source: "google", action: "redraft", id: REVIEW_ID }));
    expect(h.draft).toHaveBeenCalledOnce();
    expect(review()).toMatchObject({ draft_reply: "A fresh draft from Claude.", draft_version: 3, draft_source: "claude" });
    expect(lastEditText()).toContain("A fresh draft from Claude.");
  });

  it("skips without posting", async () => {
    await tap(IVAN, encodeReviewCallback({ source: "google", action: "skip", id: REVIEW_ID }));
    expect(review()).toMatchObject({ status: "skipped", acted_by_name: "Ivan" });
    expect(h.updateReply).not.toHaveBeenCalled();
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

  it("tells a linked shop moderator they can't change Google replies", async () => {
    await say(SAM, "Thanks!", { replyTo: 77 });
    expect(review().draft_reply).toBe("Thanks, Jane!");
    expect(h.replyInGroup).toHaveBeenCalledWith(expect.stringMatching(/Only review managers/), 500);
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
