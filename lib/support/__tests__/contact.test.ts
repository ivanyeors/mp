import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";

/**
 * A Contact Us message reaches staff twice: the email to the support inbox and
 * a notice in the Telegram group. The customer sees a failure only when both
 * fail, and the notice says whether the email went.
 */

const h = vi.hoisted(() => ({
  sendGroupMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/telegram/bot-api", () => ({ sendGroupMessage: h.sendGroupMessage }));

const { setEmailTransport } = await import("@/lib/email");
const { CONTACT_NOTICE_HEADER, deliverContactMessage, renderContactNotice } = await import(
  "@/lib/support/contact"
);

const MSG = {
  name: "Jane Tan",
  email: "jane@example.com",
  subject: "Pillow height",
  message: "Can I come in on Saturday for an adjustment?",
};

function transport(fail = false) {
  const sent: OutgoingEmail[] = [];
  const t: EmailTransport = {
    name: "fake",
    async send(email) {
      if (fail) throw new Error("Gmail send failed (500)");
      sent.push(email);
      return { id: "fake_1" };
    },
  };
  return { transport: t, sent };
}

const ENV_KEYS = ["SUPPORT_EMAIL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.SUPPORT_EMAIL = "admin@mpillow.test";
  h.sendGroupMessage.mockReset();
  h.sendGroupMessage.mockResolvedValue({ ok: true, chatId: -1, messageId: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setEmailTransport(null);
  vi.restoreAllMocks();
});

describe("renderContactNotice", () => {
  it("carries who, the subject and the whole message", () => {
    const text = renderContactNotice(MSG, true);
    expect(text.split("\n")[0]).toBe(CONTACT_NOTICE_HEADER);
    expect(text).toContain("Jane Tan · jane@example.com");
    expect(text).toContain("Subject: Pillow height");
    expect(text).toContain(MSG.message);
    expect(text).toContain("Emailed to admin@mpillow.test");
  });

  it("leaves out the subject line when there is none", () => {
    expect(renderContactNotice({ ...MSG, subject: null }, true)).not.toContain("Subject:");
    expect(renderContactNotice({ ...MSG, subject: "  " }, true)).not.toContain("Subject:");
  });

  it("tells staff to reply directly when the email failed", () => {
    const text = renderContactNotice(MSG, false);
    expect(text).toContain("The email to admin@mpillow.test failed. Reply to jane@example.com directly.");
    expect(text).not.toContain("Emailed to");
  });

  it("stays inside Telegram's 4096 characters at the form's maximum lengths", () => {
    const longest = {
      name: "n".repeat(200),
      email: `${"e".repeat(308)}@example.com`,
      subject: "s".repeat(200),
      message: "m".repeat(5000),
    };
    for (const emailed of [true, false]) {
      const text = renderContactNotice(longest, emailed);
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text).toContain("(cut short");
    }
    expect(renderContactNotice(longest, true)).toContain("the email has all of it");
    expect(renderContactNotice(longest, false)).not.toContain("the email has all of it");
  });
});

describe("deliverContactMessage", () => {
  it("emails the support inbox, Reply-To the customer, then posts the notice", async () => {
    const { transport: t, sent } = transport();
    setEmailTransport(t);

    await expect(deliverContactMessage(MSG)).resolves.toEqual({ emailed: true, notified: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("admin@mpillow.test");
    expect(sent[0].replyTo).toBe("jane@example.com");
    expect(h.sendGroupMessage).toHaveBeenCalledTimes(1);
    expect(h.sendGroupMessage.mock.calls[0][0]).toContain("Emailed to admin@mpillow.test");
  });

  it("still reaches staff on Telegram when the email fails", async () => {
    setEmailTransport(transport(true).transport);

    await expect(deliverContactMessage(MSG)).resolves.toEqual({ emailed: false, notified: true });
    expect(h.sendGroupMessage.mock.calls[0][0]).toContain("Reply to jane@example.com directly.");
  });

  it("counts the email alone when Telegram is down", async () => {
    setEmailTransport(transport().transport);
    h.sendGroupMessage.mockResolvedValue({ ok: false, error: "Bad Gateway" });

    await expect(deliverContactMessage(MSG)).resolves.toEqual({ emailed: true, notified: false });
  });

  it("reports neither when both fail", async () => {
    setEmailTransport(transport(true).transport);
    h.sendGroupMessage.mockResolvedValue({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set" });

    await expect(deliverContactMessage(MSG)).resolves.toEqual({ emailed: false, notified: false });
  });
});
