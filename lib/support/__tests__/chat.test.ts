import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import type { SupportChatRow } from "@/lib/support/chat";

/**
 * The website chat: a visitor's messages post to the staff Telegram group,
 * threaded under the chat's first notice; a staff reply to any of them comes
 * back as the chat's next message; the transcript is emailed when the customer
 * ends the chat, leaves it, or is away when staff reply — once per new message.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  sendGroupMessage: vi.fn(),
  replyInGroup: vi.fn(),
  reactInGroup: vi.fn(),
  nextTelegramId: 100,
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fakeSupabaseAdmin(h.db) }));
vi.mock("@/lib/telegram/bot-api", () => ({
  sendGroupMessage: h.sendGroupMessage,
  replyInGroup: h.replyInGroup,
  reactInGroup: h.reactInGroup,
}));

const { setEmailTransport } = await import("@/lib/email");
const chat = await import("@/lib/support/chat");
const { handleChatReplyUpdate, isChatReplyCandidate } = await import("@/lib/support/chat-telegram");
const { CHAT_NOTICE_HEADER } = await import("@/lib/support/chat-notices");
const { MP_CONFIG_TELEGRAM_CHAT_ID } = await import("@/lib/telegram/notify");

function transport(fail = false) {
  const sent: OutgoingEmail[] = [];
  const t: EmailTransport = {
    name: "fake",
    async send(email) {
      if (fail) throw new Error("Gmail send failed (500)");
      sent.push(email);
      return { id: `fake_${sent.length}` };
    },
  };
  return { transport: t, sent };
}

const T0 = new Date("2026-10-24T02:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let savedSupport: string | undefined;

beforeEach(() => {
  h.db = { support_chats: [], support_chat_messages: [] };
  h.nextTelegramId = 100;
  h.sendGroupMessage.mockReset();
  h.sendGroupMessage.mockImplementation(async () => ({ ok: true, chatId: -1, messageId: h.nextTelegramId++ }));
  h.replyInGroup.mockReset();
  h.reactInGroup.mockReset();
  h.reactInGroup.mockResolvedValue(true);
  savedSupport = process.env.SUPPORT_EMAIL;
  process.env.SUPPORT_EMAIL = "admin@mpillow.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (savedSupport === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = savedSupport;
  setEmailTransport(null);
  vi.restoreAllMocks();
});

const messagesOf = (id: string) => h.db.support_chat_messages.filter((m) => m.chat_id === id);
const chatRow = (id: string) => h.db.support_chats.find((c) => c.id === id) as unknown as SupportChatRow;

/** A staff member's reply in the group to the Telegram message `replyTo`. */
function staffUpdate(replyTo: number, text: string, messageId: number, name = "Darren") {
  return {
    message: {
      message_id: messageId,
      chat: { id: MP_CONFIG_TELEGRAM_CHAT_ID },
      from: { id: 42, first_name: name },
      text,
      reply_to_message: { message_id: replyTo },
    },
  };
}

const noWait = { wait: async () => {} };

describe("starting a chat", () => {
  it("stores it, posts the root notice, and opens only with its token", async () => {
    const { chat: c, token, message, delivered } = await chat.startChat({ body: "  Which size fits me?  ", now: T0 });

    expect(delivered).toBe(true);
    expect(message).toMatchObject({ sender: "customer", body: "Which size fits me?" });
    expect(c.telegram_root_message_id).toBe(100);
    expect(messagesOf(c.id)[0].telegram_message_id).toBe(100);
    expect(c.preview).toBe("Which size fits me?");

    const [text, , opts] = h.sendGroupMessage.mock.calls[0];
    expect(text.split("\n")[0]).toBe(`${CHAT_NOTICE_HEADER} #${chat.toChatView(c).ref}`);
    expect(text).toContain("Visitor · no email yet");
    expect(text).toContain("Which size fits me?");
    expect(opts).toEqual({ replyToMessageId: undefined });

    expect(chat.canAccessChat(c, { token })).toBe(true);
    expect(chat.canAccessChat(c, { token: "nope" })).toBe(false);
    expect(chat.canAccessChat(c, {})).toBe(false);
    expect(c.token_hash).not.toContain(token);
  });

  it("belongs to a signed-in customer from the start", async () => {
    const customer = { customerId: "cust-1", authUserId: "user-1", email: "jane@example.com", name: "Jane Tan" };
    const { chat: c } = await chat.startChat({ body: "Hi", customer, now: T0 });
    expect(c).toMatchObject({ customer_id: "cust-1", auth_user_id: "user-1", email: "jane@example.com", name: "Jane Tan" });
    expect(chat.canAccessChat(c, { authUserId: "user-1" })).toBe(true);
    expect(chat.canAccessChat(c, { authUserId: "user-2" })).toBe(false);
    expect(h.sendGroupMessage.mock.calls[0][0]).toContain("Jane Tan · jane@example.com · has an account");
  });
});

describe("customer messages", () => {
  it("thread under the root notice", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    const res = await chat.addCustomerMessage(c, "Are you open on Sunday?", at(10));
    expect(res).toMatchObject({ ok: true, delivered: true });
    const [text, , opts] = h.sendGroupMessage.mock.calls[1];
    expect(text).toBe(`💬 #${chat.toChatView(c).ref} · Visitor\nAre you open on Sunday?`);
    expect(opts).toEqual({ replyToMessageId: 100 });
    expect(messagesOf(c.id)[1].telegram_message_id).toBe(101);
  });

  it("post the root later, carrying every message, when Telegram was down at the start", async () => {
    h.sendGroupMessage.mockResolvedValueOnce({ ok: false, error: "Bad Gateway" });
    const { chat: c, delivered } = await chat.startChat({ body: "First", now: T0 });
    expect(delivered).toBe(false);
    expect(c.telegram_root_message_id).toBeNull();

    const res = await chat.addCustomerMessage(c, "Second", at(5));
    if (!res.ok) throw new Error("expected ok");
    expect(res.chat.telegram_root_message_id).toBe(100);
    const [text, , opts] = h.sendGroupMessage.mock.calls[1];
    expect(text).toContain("First\n\nSecond");
    expect(opts).toEqual({ replyToMessageId: undefined });
  });

  it("are refused once the chat has ended", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    const { chat: ended } = await chat.endChat(c, at(1));
    await expect(chat.addCustomerMessage(ended, "Hello?")).resolves.toEqual({ ok: false, reason: "ended" });
  });
});

describe("staff replies from Telegram", () => {
  it("only consider replies in the measurements group that aren't commands", () => {
    expect(isChatReplyCandidate(staffUpdate(100, "Hi!", 200))).toBe(true);
    expect(isChatReplyCandidate(staffUpdate(100, "/stock", 200))).toBe(false);
    const other = staffUpdate(100, "Hi!", 200);
    other.message.chat.id = -1;
    expect(isChatReplyCandidate(other)).toBe(false);
    const bot = staffUpdate(100, "Hi!", 200);
    (bot.message.from as { is_bot?: boolean }).is_bot = true;
    expect(isChatReplyCandidate(bot)).toBe(false);
    expect(isChatReplyCandidate({ message: { ...staffUpdate(100, "Hi", 200).message, reply_to_message: undefined } })).toBe(false);
  });

  it("reach a customer on the page, with a 👍 and no email", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Hi", now: new Date() });
    await chat.setChatContact(c, { email: "jane@example.com" });

    await handleChatReplyUpdate(staffUpdate(100, "Hi Jane, how can we help?", 300), noWait);

    const stored = messagesOf(c.id).at(-1)!;
    expect(stored).toMatchObject({ sender: "staff", body: "Hi Jane, how can we help?", staff_name: "Darren", telegram_message_id: 300 });
    expect(h.reactInGroup).toHaveBeenCalledWith(300, "👍");
    expect(sent).toHaveLength(0);
  });

  it("also route a reply to a later message of the chat", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: new Date() });
    await chat.addCustomerMessage(c, "Anyone there?");
    await handleChatReplyUpdate(staffUpdate(101, "Yes!", 301), noWait);
    expect(messagesOf(c.id).at(-1)).toMatchObject({ sender: "staff", body: "Yes!" });
  });

  it("are emailed with the whole chat when the customer has left, once", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Do you ship to Malaysia?", now: new Date() });
    const withEmail = await chat.setChatContact(c, { email: "jane@example.com", name: "Jane" });
    await chat.markChatLeft(withEmail);

    await handleChatReplyUpdate(staffUpdate(100, "We do! 3–5 days.", 300), noWait);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "jane@example.com",
      cc: ["admin@mpillow.test", "sg@mpillow.com"],
      subject: `Your chat with mpillow (#${chat.toChatView(c).ref})`,
    });
    expect(sent[0].text).toContain("Do you ship to Malaysia?");
    expect(sent[0].text).toContain("We do! 3–5 days.");
    expect(h.replyInGroup).toHaveBeenLastCalledWith(
      "📧 They've left the page, so your reply went to jane@example.com with the whole chat.",
      300,
    );
    expect(chatRow(c.id).transcript_message_count).toBe(2);

    // Nothing new: nothing sent.
    await expect(chat.emailTranscriptIfNew(c.id, "left")).resolves.toBe("nothing_new");
    expect(sent).toHaveLength(1);
  });

  it("send one email for two quick replies: the earlier one leaves it to the later", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Hi", now: new Date() });
    await chat.markChatLeft(await chat.setChatContact(c, { email: "jane@example.com" }));
    h.replyInGroup.mockClear();

    // The first handler records its reply, then (while it waits) the second arrives.
    await handleChatReplyUpdate(staffUpdate(100, "One sec", 300), {
      wait: () => handleChatReplyUpdate(staffUpdate(100, "Found it: 11am works", 301), noWait),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("One sec");
    expect(sent[0].text).toContain("Found it: 11am works");
    expect(h.replyInGroup).toHaveBeenCalledTimes(1);
    expect(h.replyInGroup.mock.calls[0][1]).toBe(301);
  });

  it("tell staff when the customer left without an email", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: new Date() });
    await chat.markChatLeft(c);
    await handleChatReplyUpdate(staffUpdate(100, "Hello?", 300), noWait);
    expect(h.replyInGroup).toHaveBeenLastCalledWith(
      "⚠️ They've left the page and they gave no email, so your reply can't reach them unless they come back to that tab.",
      300,
    );
  });

  it("ignore replies to messages that aren't a chat's", async () => {
    await handleChatReplyUpdate(staffUpdate(999, "lol", 300), noWait);
    expect(h.reactInGroup).not.toHaveBeenCalled();
    expect(h.replyInGroup).not.toHaveBeenCalled();
  });

  it("say only text goes through, for a photo under a chat message", async () => {
    await chat.startChat({ body: "Hi", now: new Date() });
    const update = staffUpdate(100, "", 300);
    delete (update.message as { text?: string }).text;
    await handleChatReplyUpdate(update, noWait);
    expect(h.replyInGroup.mock.calls[0][0]).toMatch(/Only text reaches the website chat/);
  });
});

describe("presence", () => {
  it("is a recent poll on an open chat the page hasn't left", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    expect(chat.isCustomerPresent(c, at(30))).toBe(true);
    expect(chat.isCustomerPresent(c, at(120))).toBe(false);
    const left = await chat.markChatLeft(c, at(31));
    expect(chat.isCustomerPresent(left, at(32))).toBe(false);
    const back = await chat.touchChat(left, at(40));
    expect(back.left_at).toBeNull();
    expect(chat.isCustomerPresent(back, at(41))).toBe(true);
  });

  it("writes a poll at most every 20 seconds", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    expect((await chat.touchChat(c, at(5))).last_seen_at).toBe(T0.toISOString());
    expect((await chat.touchChat(c, at(25))).last_seen_at).toBe(at(25).toISOString());
  });
});

describe("leaving the page", () => {
  it("emails the transcript when the page doesn't come back", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    await chat.markChatLeft(await chat.setChatContact(c, { email: "jane@example.com" }));
    await expect(chat.settleLeave(c.id)).resolves.toBe("sent");
    expect(sent[0].text).toContain("so far");
  });

  it("sends nothing after a reload, which polls again", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    const left = await chat.markChatLeft(await chat.setChatContact(c, { email: "jane@example.com" }), at(10));
    await chat.touchChat(left, at(12));
    await expect(chat.settleLeave(c.id)).resolves.toBe("skipped");
    expect(sent).toHaveLength(0);
  });

  it("gives the claim back when the email fails, so the next trigger retries", async () => {
    setEmailTransport(transport(true).transport);
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    await chat.markChatLeft(await chat.setChatContact(c, { email: "jane@example.com" }));
    await expect(chat.settleLeave(c.id)).resolves.toBe("failed");
    expect(chatRow(c.id).transcript_message_count).toBe(0);
  });
});

describe("ending a chat", () => {
  it("emails the transcript and notes it in the group", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);
    const { chat: c } = await chat.startChat({ body: "Thanks!", now: T0 });
    const { chat: ended, emailed } = await chat.endChat(await chat.setChatContact(c, { email: "jane@example.com" }), at(60));
    expect(emailed).toBe(true);
    expect(ended).toMatchObject({ status: "ended", ended_at: at(60).toISOString() });
    expect(sent[0].text).toContain("Here's a copy of your chat with us.");
    expect(h.replyInGroup).toHaveBeenLastCalledWith(
      `✅ #${chat.toChatView(c).ref}: the customer ended the chat. The transcript went to jane@example.com.`,
      100,
    );
  });

  it("says the chat is gone for a visitor without an email", async () => {
    const { chat: c } = await chat.startChat({ body: "Bye", now: T0 });
    const { emailed } = await chat.endChat(c);
    expect(emailed).toBe(false);
    expect(h.replyInGroup.mock.calls.at(-1)![0]).toContain("They gave no email, so the chat is gone for them.");
  });
});

describe("accounts", () => {
  const jane = { customerId: "cust-1", authUserId: "user-1", email: "jane@example.com", name: "Jane Tan" };

  it("claims a visitor's chat into the account that signed in from it", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", now: T0 });
    const claimed = await chat.claimChat(await chat.setChatContact(c, { email: "JANE@example.com" }), jane);
    expect(claimed).toMatchObject({ auth_user_id: "user-1", customer_id: "cust-1", email: "jane@example.com" });
    expect(h.replyInGroup.mock.calls.at(-1)![0]).toContain("signed in");
  });

  it("never moves a chat out of another account", async () => {
    const { chat: c } = await chat.startChat({ body: "Hi", customer: { ...jane, authUserId: "user-2" }, now: T0 });
    await expect(chat.claimChat(c, jane)).resolves.toBeNull();
  });

  it("lists the account's chats, adopting unowned ones with its email", async () => {
    const { chat: mine } = await chat.startChat({ body: "Mine", now: T0 });
    await chat.setChatContact(mine, { email: "Jane@Example.com" });
    const { chat: other } = await chat.startChat({ body: "Not mine", now: at(1) });
    await chat.setChatContact(other, { email: "someone@example.com" });
    const { chat: started } = await chat.startChat({ body: "Signed in", customer: jane, now: at(2) });

    const list = await chat.listCustomerChats(jane);
    expect(list.map((c) => c.id)).toEqual([started.id, mine.id]);
    expect(list[1]).toMatchObject({ preview: "Mine", hasAccount: true });
    expect(chatRow(other.id).auth_user_id).toBeNull();
  });
});
