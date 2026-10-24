import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review cards share the inventory bot's webhook. Review updates are routed
 * before TELEGRAM_ALLOWED_CHATS (they carry their own gate: the measurements
 * group plus Telegram RBAC) and are handled after the 200, so a slow Google
 * post never makes Telegram retry. Everything else reaches the inventory
 * bot exactly as before.
 */

const h = vi.hoisted(() => ({ after: vi.fn(), handle: vi.fn(), handleInbox: vi.fn(), handleChat: vi.fn(), from: vi.fn() }));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: h.after,
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({ from: h.from }) }));
vi.mock("@/lib/reviews/telegram-handler", async (orig) => ({
  ...(await orig<typeof import("@/lib/reviews/telegram-handler")>()),
  handleReviewUpdate: h.handle,
}));
vi.mock("@/lib/social-inbox/telegram-handler", async (orig) => ({
  ...(await orig<typeof import("@/lib/social-inbox/telegram-handler")>()),
  handleInboxUpdate: h.handleInbox,
}));
vi.mock("@/lib/support/chat-telegram", async (orig) => ({
  ...(await orig<typeof import("@/lib/support/chat-telegram")>()),
  handleChatReplyUpdate: h.handleChat,
}));

const { POST } = await import("@/app/api/telegram/webhook/route");

const SECRET = "tg-secret";
const GROUP = -1001279910218;

function post(update: unknown) {
  return new Request("https://x.test/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify(update),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  // An allowlist that does not include the measurements group.
  vi.stubEnv("TELEGRAM_ALLOWED_CHATS", "12345");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Telegram webhook review routing", () => {
  it("hands a review button to the review handler after responding, despite the allowlist", async () => {
    const update = {
      update_id: 1,
      callback_query: {
        id: "cq",
        from: { id: 111 },
        data: "rv:g:skip:3f2b7c1e-8a4d-4e9b-9c11-0123456789ab",
        message: { message_id: 7, chat: { id: GROUP } },
      },
    };
    const res = await POST(post(update));
    expect(res.status).toBe(200);
    expect(h.handle).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledOnce();
    await h.after.mock.calls[0][0]();
    expect(h.handle).toHaveBeenCalledWith(update);
  });

  it("leaves inventory updates to the allowlist and the inventory bot", async () => {
    const res = await POST(
      post({ update_id: 2, message: { message_id: 1, chat: { id: GROUP, type: "group" }, text: "/stock" } }),
    );
    expect(res.status).toBe(200);
    expect(h.after).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "Telegram webhook rejected: chat not in TELEGRAM_ALLOWED_CHATS",
      GROUP,
    );
  });

  it("hands a reply to a customer message card to the inbox handler after responding", async () => {
    const update = {
      update_id: 4,
      message: {
        message_id: 9,
        chat: { id: GROUP, type: "supergroup" },
        from: { id: 111 },
        text: "Yes, we're open on Sunday!",
        reply_to_message: { message_id: 8, text: "💬 INSTAGRAM DM · @jane\n…" },
      },
    };
    const res = await POST(post(update));
    expect(res.status).toBe(200);
    expect(h.handle).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledOnce();
    await h.after.mock.calls[0][0]();
    expect(h.handleInbox).toHaveBeenCalledWith(update);
    // The website chat takes any other reply in the group; never this one.
    expect(h.handleChat).not.toHaveBeenCalled();
  });

  it("hands a reply to a website chat message to the chat handler", async () => {
    const update = {
      update_id: 5,
      message: {
        message_id: 11,
        chat: { id: GROUP, type: "supergroup" },
        from: { id: 111 },
        text: "Happy to help with that.",
        reply_to_message: { message_id: 10, text: "💬 WEBSITE CHAT #3F9A2C\nJane · jane@x.test\n…" },
      },
    };
    const res = await POST(post(update));
    expect(res.status).toBe(200);
    expect(h.after).toHaveBeenCalledOnce();
    await h.after.mock.calls[0][0]();
    expect(h.handleChat).toHaveBeenCalledWith(update);
    expect(h.handleInbox).not.toHaveBeenCalled();
  });

  it("still refuses an unsigned review update", async () => {
    const res = await POST(
      new Request("https://x.test/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update_id: 3, callback_query: { id: "cq", from: { id: 1 }, data: "rv:g:skip:x" } }),
      }) as never,
    );
    expect(res.status).toBe(401);
    expect(h.after).not.toHaveBeenCalled();
  });
});
