import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/reviews/__tests__/fake-supabase";
import type { SocialEvent } from "@/lib/social-inbox/types";

/**
 * Customer messages end to end, against an in-memory database: a webhook
 * event becomes one card in the measurements group, a staff reply to that card
 * reaches the customer (only from someone allowed, only inside the reply
 * window, never twice), and echoes and unsends keep the group up to date.
 */

const GROUP = -1001279910218;
const IVAN = { id: 111, first_name: "Ivan" }; // inbox agent
const SAM = { id: 222, first_name: "Sam" }; // shop moderator
const RITA = { id: 333, first_name: "Rita" }; // review manager
const STRANGER = { id: 999, first_name: "Who" };

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  nextTelegramId: 1000,
  sendGroupMessage: vi.fn(),
  sendGroupPhoto: vi.fn(),
  replyInGroup: vi.fn(),
  send: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));
vi.mock("@/lib/telegram/bot-api", () => ({
  sendGroupMessage: h.sendGroupMessage,
  sendGroupPhoto: h.sendGroupPhoto,
  replyInGroup: h.replyInGroup,
  sendGroupCard: vi.fn(),
  editGroupCard: vi.fn(),
  answerCallback: vi.fn(),
  deleteGroupMessage: vi.fn(),
  replyInChat: vi.fn(),
}));
vi.mock("@/lib/social-inbox/send", () => ({ sendToCustomer: h.send }));
vi.mock("@/lib/social-inbox/meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/social-inbox/meta")>()),
  fetchMetaProfile: h.profile,
}));

const { ingestSocialEvents, sweepUncarded } = await import("@/lib/social-inbox/ingest");
const { handleInboxUpdate, isInboxUpdate } = await import("@/lib/social-inbox/telegram-handler");
const { UNSENT_NOTE } = await import("@/lib/social-inbox/cards");

const messages = () => (h.tables.social_messages ?? []) as Row[];
const conversations = () => (h.tables.social_conversations ?? []) as Row[];

function igMessage(id: string, text: string | null, extra: Partial<Extract<SocialEvent, { kind: "message" }>> = {}): SocialEvent {
  return {
    kind: "message",
    platform: "instagram",
    externalId: "IGSID1",
    messageId: id,
    text,
    attachments: [],
    sentAt: new Date().toISOString(),
    ...extra,
  };
}

/** The text and Telegram id of the card posted for an inbound message. */
function cardOf(externalMessageId: string) {
  const row = messages().find((m) => m.external_message_id === externalMessageId)!;
  const call = h.sendGroupMessage.mock.calls.find((c) => String(c[0]).includes(String(row.body ?? "")));
  return { id: row.telegram_message_id as number, text: String(call?.[0] ?? "") };
}

function reply(from: { id: number }, text: string, to: { id: number; text: string }, messageId = 500) {
  return handleInboxUpdate({
    message: { message_id: messageId, chat: { id: GROUP }, from, text, reply_to_message: { message_id: to.id, text: to.text } },
  });
}

const lastReply = () => String(h.replyInGroup.mock.calls.at(-1)?.[0] ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  h.nextTelegramId = 1000;
  h.sendGroupMessage.mockImplementation(async () => ({ ok: true, chatId: GROUP, messageId: (h.nextTelegramId += 1) }));
  h.sendGroupPhoto.mockImplementation(async () => ({ ok: true, chatId: GROUP, messageId: (h.nextTelegramId += 1) }));
  h.replyInGroup.mockImplementation(async () => (h.nextTelegramId += 1));
  h.send.mockResolvedValue({ ok: true, messageId: "out-1" });
  h.profile.mockResolvedValue({ displayName: "Jane Tan", username: "janetan" });
  h.tables = {
    telegram_operators: [
      { id: "op-ivan", display_name: "Ivan", role: "inbox_agent", is_active: true, telegram_user_id: IVAN.id },
      { id: "op-sam", display_name: "Sam", role: "shop_moderator", is_active: true, telegram_user_id: SAM.id },
      { id: "op-rita", display_name: "Rita", role: "review_manager", is_active: true, telegram_user_id: RITA.id },
    ],
    social_conversations: [],
    social_messages: [],
  };
  h.db = createFakeSupabase(h.tables, {
    social_conversations: {
      display_name: null,
      username: null,
      last_inbound_at: null,
      last_outbound_at: null,
      last_card_chat_id: null,
      last_card_message_id: null,
      profile_checked_at: null,
    },
    social_messages: {
      error: null,
      unsent_at: null,
      telegram_chat_id: null,
      telegram_message_id: null,
      telegram_source_message_id: null,
    },
  });
});

describe("incoming messages", () => {
  it("cards a new message once, with the customer's name, and threads the next one under it", async () => {
    expect(await ingestSocialEvents([igMessage("in.1", "Do you open on Sundays?")])).toMatchObject({ carded: 1 });
    expect(h.sendGroupMessage).toHaveBeenCalledTimes(1);
    const [text, markup, opts] = h.sendGroupMessage.mock.calls[0];
    expect(String(text).split("\n")[0]).toBe("💬 INSTAGRAM DM · Jane Tan (@janetan)");
    expect(text).toContain("“Do you open on Sundays?”");
    expect(markup).toBeUndefined();
    expect(opts).toEqual({ replyToMessageId: null });
    expect(messages()[0]).toMatchObject({ status: "carded", telegram_chat_id: GROUP, telegram_message_id: 1001 });

    // Meta delivered it again: nothing new.
    expect(await ingestSocialEvents([igMessage("in.1", "Do you open on Sundays?")])).toMatchObject({ duplicates: 1, carded: 0 });
    expect(h.sendGroupMessage).toHaveBeenCalledTimes(1);

    await ingestSocialEvents([igMessage("in.2", "And how much is a fitting?")]);
    expect(h.sendGroupMessage.mock.calls[1][2]).toEqual({ replyToMessageId: 1001 });
    expect(h.profile).toHaveBeenCalledTimes(1);
    expect(conversations()).toHaveLength(1);
    expect(conversations()[0]).toMatchObject({ display_name: "Jane Tan", username: "janetan", last_card_message_id: 1002 });
  });

  it("posts a photo as the card, and falls back to text when Telegram can't fetch it", async () => {
    const photo = { attachments: [{ kind: "image" as const, url: "https://cdn.example/p.jpg" }] };
    await ingestSocialEvents([igMessage("in.1", "Is this the right height?", photo)]);
    expect(h.sendGroupPhoto).toHaveBeenCalledWith("https://cdn.example/p.jpg", expect.stringMatching(/^💬 INSTAGRAM DM/), {
      replyToMessageId: null,
    });
    expect(h.sendGroupMessage).not.toHaveBeenCalled();

    h.sendGroupPhoto.mockResolvedValueOnce({ ok: false, error: "wrong file identifier/HTTP URL specified" });
    await ingestSocialEvents([igMessage("in.2", null, photo)]);
    expect(h.sendGroupMessage).toHaveBeenCalledOnce();
    expect(String(h.sendGroupMessage.mock.calls[0][0])).toContain("📷 Photo: https://cdn.example/p.jpg");
    expect(messages().every((m) => m.status === "carded")).toBe(true);
  });

  it("keeps a message whose card failed, and the sweep cards it later", async () => {
    h.sendGroupMessage.mockResolvedValueOnce({ ok: false, error: "Too Many Requests: retry after 5" });
    expect(await ingestSocialEvents([igMessage("in.1", "Hello?")])).toMatchObject({ failed: 1 });
    expect(messages()[0]).toMatchObject({ status: "new", error: "Too Many Requests: retry after 5" });

    expect(await sweepUncarded({ now: new Date(Date.now() + 5 * 60_000) })).toEqual({ retried: 1, carded: 1 });
    expect(messages()[0]).toMatchObject({ status: "carded", error: null });
    // Nothing left to sweep.
    expect(await sweepUncarded({ now: new Date(Date.now() + 10 * 60_000) })).toEqual({ retried: 0, carded: 0 });
  });

  it("notes an unsent message under its card", async () => {
    await ingestSocialEvents([igMessage("in.1", "oops wrong chat")]);
    await ingestSocialEvents([{ kind: "unsend", platform: "instagram", externalId: "IGSID1", messageId: "in.1" }]);
    expect(h.replyInGroup).toHaveBeenCalledWith(UNSENT_NOTE, 1001);
    expect(messages()[0].unsent_at).toBeTruthy();
  });
});

describe("answering from Telegram", () => {
  beforeEach(async () => {
    await ingestSocialEvents([igMessage("in.1", "Do you open on Sundays?")]);
  });

  it("sends an Inbox agent's reply to the customer and confirms it in the group", async () => {
    await reply(IVAN, "Yes — Sundays 11am to 6pm!", cardOf("in.1"));

    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", external_id: "IGSID1" }),
      "Yes — Sundays 11am to 6pm!",
      null,
    );
    expect(h.replyInGroup).toHaveBeenLastCalledWith(
      "📤 Sent to Jane Tan (@janetan) on Instagram by Ivan. Reply to this to send another message.",
      500,
    );
    const out = messages().find((m) => m.direction === "outbound")!;
    expect(out).toMatchObject({
      source: "telegram",
      status: "sent",
      external_message_id: "out-1",
      sent_by_name: "Ivan",
      telegram_message_id: 1002,
    });

    // Replying to the "Sent" note continues the same conversation.
    h.send.mockResolvedValueOnce({ ok: true, messageId: "out-2" });
    await reply(IVAN, "See you then.", { id: 1002, text: lastReply() }, 501);
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it("sends a Telegram update delivered twice only once", async () => {
    await reply(IVAN, "Yes!", cardOf("in.1"));
    await reply(IVAN, "Yes!", cardOf("in.1"));
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("keeps // notes in the group and tells anyone not allowed that nothing was sent", async () => {
    await reply(IVAN, "// I'll take this one", cardOf("in.1"));
    expect(h.send).not.toHaveBeenCalled();
    expect(h.replyInGroup).not.toHaveBeenCalled();

    await reply(STRANGER, "Hi! Yes we are", cardOf("in.1"), 502);
    expect(lastReply()).toContain("Not sent — you're not set up to answer customers yet");
    expect(lastReply()).toContain("Your Telegram ID: 999");

    await reply(SAM, "Hi! Yes we are", cardOf("in.1"), 503);
    expect(lastReply()).toBe("Not sent — Shop moderators can't answer customer messages. Ask an admin to make you an Inbox agent.");
    expect(h.send).not.toHaveBeenCalled();

    await reply(RITA, "Hi! Yes we are", cardOf("in.1"), 504);
    expect(h.send).toHaveBeenCalledOnce();
  });

  it("refuses past the 24-hour window, and uses the Human Agent tag once Meta approves it", async () => {
    conversations()[0].last_inbound_at = new Date(Date.now() - 30 * 3_600_000).toISOString();
    await reply(IVAN, "Sorry for the late reply!", cardOf("in.1"));
    expect(h.send).not.toHaveBeenCalled();
    expect(lastReply()).toMatch(/^❌ Not sent — Instagram only accepts replies from here within 24 hours/);
    expect(messages().filter((m) => m.direction === "outbound")).toHaveLength(0);

    vi.stubEnv("META_HUMAN_AGENT_ENABLED", "true");
    await reply(IVAN, "Sorry for the late reply!", cardOf("in.1"), 501);
    expect(h.send).toHaveBeenCalledWith(expect.anything(), "Sorry for the late reply!", "HUMAN_AGENT");
  });

  it("reports the platform's refusal and marks the reply failed", async () => {
    h.send.mockResolvedValueOnce({ ok: false, error: "This person isn't available right now (#551)" });
    await reply(IVAN, "Hello?", cardOf("in.1"));
    expect(lastReply()).toBe("❌ Not sent — Instagram said: This person isn't available right now (#551)");
    expect(messages().find((m) => m.direction === "outbound")).toMatchObject({ status: "failed" });
  });

  it("explains that only text can be sent", async () => {
    const card = cardOf("in.1");
    await handleInboxUpdate({
      message: {
        message_id: 600,
        chat: { id: GROUP },
        from: IVAN,
        caption: "look",
        reply_to_message: { message_id: card.id, text: card.text },
      },
    });
    expect(lastReply()).toContain("only text goes to customers from here");
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("echoes", () => {
  beforeEach(async () => {
    await ingestSocialEvents([igMessage("in.1", "Do you open on Sundays?")]);
    h.replyInGroup.mockClear();
  });

  const echo = (id: string, text: string): SocialEvent => ({
    kind: "echo",
    platform: "instagram",
    externalId: "IGSID1",
    messageId: id,
    text,
    attachments: [],
    sentAt: new Date().toISOString(),
  });

  it("ignores the echo of our own reply, before or after the send returns", async () => {
    await reply(IVAN, "Yes!", cardOf("in.1"));
    h.replyInGroup.mockClear();
    await ingestSocialEvents([echo("out-1", "Yes!")]);
    expect(h.replyInGroup).not.toHaveBeenCalled();

    // The echo beats the API response: matched by text while still sending.
    let finishSend: (v: unknown) => void = () => {};
    h.send.mockImplementationOnce(() => new Promise((resolve) => (finishSend = resolve)));
    const sending = reply(IVAN, "On my way", cardOf("in.1"), 501);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(2));
    await ingestSocialEvents([echo("out-2", "On my way")]);
    finishSend({ ok: true, messageId: "out-2" });
    await sending;
    expect(h.replyInGroup.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/^📤 Sent to/),
    ]);
    expect(messages().filter((m) => m.source === "platform_app")).toHaveLength(0);
  });

  it("notes a reply sent from the Instagram app under the customer's card", async () => {
    await ingestSocialEvents([echo("app-1", "We're open 11 to 6 on Sundays")]);
    expect(h.replyInGroup).toHaveBeenCalledWith("↪️ Answered in Instagram or Business Suite: “We're open 11 to 6 on Sundays”", 1001);
    expect(messages().find((m) => m.source === "platform_app")).toMatchObject({ status: "recorded", telegram_message_id: 1002 });
  });
});

describe("isInboxUpdate", () => {
  it("claims replies to inbox cards in the group — not commands, other chats or other replies", async () => {
    const card = { message_id: 7, text: "💬 TIKTOK DM · @sam\n…" };
    const msg = (extra: Record<string, unknown>) => ({
      message: { message_id: 1, chat: { id: GROUP }, from: IVAN, text: "hi", reply_to_message: card, ...extra },
    });
    expect(isInboxUpdate(msg({}))).toBe(true);
    expect(isInboxUpdate(msg({ text: undefined, caption: "photo" }))).toBe(true);
    expect(isInboxUpdate(msg({ reply_to_message: { message_id: 7, caption: card.text } }))).toBe(true);
    expect(isInboxUpdate(msg({ text: "/stock" }))).toBe(false);
    expect(isInboxUpdate(msg({ chat: { id: 12345 } }))).toBe(false);
    expect(isInboxUpdate(msg({ reply_to_message: { message_id: 7, text: "Enter quantity for IN – x" } }))).toBe(false);
    expect(isInboxUpdate(msg({ reply_to_message: undefined }))).toBe(false);
  });
});
