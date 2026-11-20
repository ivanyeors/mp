import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fakeSupabaseAdmin(h.db) }));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: async () => null, getAuthIdentity: async () => null }));
vi.mock("@/lib/telegram/bot-api", () => ({
  sendGroupMessage: vi.fn(async () => ({ ok: true, chatId: -1, messageId: 100 })),
  replyInGroup: vi.fn(async () => true),
  reactInGroup: vi.fn(async () => true),
}));

const { POST: startChat } = await import("../route");
const { POST: sendCode } = await import("../code/route");
const { setEmailTransport } = await import("@/lib/email");
const { resetRateLimits } = await import("@/lib/rate-limit");

let sent: OutgoingEmail[] = [];

beforeEach(() => {
  h.db = { support_chats: [], support_chat_messages: [], support_chat_codes: [] };
  sent = [];
  const transport: EmailTransport = {
    name: "fake",
    async send(email) {
      sent.push(email);
      return { id: `fake_${sent.length}` };
    },
  };
  setEmailTransport(transport);
  resetRateLimits();
});

function post(handler: (req: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request("http://localhost/api/support/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    }),
  );
}

async function emailedCode(email = "jane@example.com") {
  const res = await post(sendCode, { email });
  expect(res.status).toBe(200);
  const { codeId } = (await res.json()) as { codeId: string };
  const code = /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1];
  return { codeId, code };
}

describe("POST /api/support/chat without an account", () => {
  it("won't start a chat until the email is checked", async () => {
    const res = await post(startChat, { message: "Hi" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ needsCode: true });
    expect(h.db.support_chats).toHaveLength(0);
  });

  it("starts one with the emailed code, under that address", async () => {
    const { codeId, code } = await emailedCode("Jane@Example.com");
    const wrong = code === "000000" ? "111111" : "000000";

    const refused = await post(startChat, { message: "Hi", verification: { codeId, code: wrong } });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ codeError: "wrong" });
    expect(h.db.support_chats).toHaveLength(0);

    const res = await post(startChat, { message: "Which size fits me?", name: "Jane", verification: { codeId, code } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chat: { email: string; name: string; hasAccount: boolean }; token: string };
    expect(body.chat).toMatchObject({ email: "jane@example.com", name: "Jane", hasAccount: false });
    expect(body.token).toBeTruthy();

    const again = await post(startChat, { message: "Hi again", verification: { codeId, code } });
    expect(await again.json()).toMatchObject({ codeError: "expired" });
  });

  it("starts the next chat in the tab from the token of the one the code started", async () => {
    const { codeId, code } = await emailedCode();
    const first = (await (await post(startChat, { message: "First", name: "Jane", verification: { codeId, code } })).json()) as {
      chat: { id: string };
      token: string;
    };

    const res = await post(startChat, { message: "Second", after: { id: first.chat.id, token: first.token } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { chat: { email: string; name: string } }).chat).toMatchObject({
      email: "jane@example.com",
      name: "Jane",
    });

    const forged = await post(startChat, { message: "Third", after: { id: first.chat.id, token: "not-the-token" } });
    expect(forged.status).toBe(401);
    expect(h.db.support_chats).toHaveLength(2);
  });
});
