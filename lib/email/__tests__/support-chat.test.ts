process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_CC, uniqueAddresses } from "../contact";
import { chatTranscriptRecipients, renderChatTranscriptEmail, type ChatTranscript } from "../support-chat";
import { ResendTransport, buildRawMessage } from "../transport";
import type { OutgoingEmail } from "../types";

/**
 * A website chat's transcript goes to the customer, with the support inbox and
 * sg@mpillow.com on Cc and Reply-To the inbox and the customer. Every
 * transcript of one chat has the same subject, so they thread.
 */

const TRANSCRIPT: ChatTranscript = {
  ref: "3F9A2C",
  chatId: "3f9a2c41-7d0e-4b8a-9c55-1e2f3a4b5c6d",
  name: "Jane Tan",
  email: "jane@example.com",
  hasAccount: false,
  reason: "staff_reply",
  messages: [
    { sender: "customer", body: "Can I come in on Saturday for an adjustment?", createdAt: "2026-10-24T02:14:00Z" },
    { sender: "staff", staffName: "Darren", body: "Yes, 11am works.", createdAt: "2026-10-24T02:31:00Z" },
  ],
};

let savedSupport: string | undefined;

beforeEach(() => {
  savedSupport = process.env.SUPPORT_EMAIL;
  process.env.SUPPORT_EMAIL = "admin@mpillow.test";
});

afterEach(() => {
  if (savedSupport === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = savedSupport;
  vi.unstubAllGlobals();
});

describe("chatTranscriptRecipients", () => {
  it("goes to the customer with the support inbox and sg@ on Cc", () => {
    expect(CONTACT_CC).toBe("sg@mpillow.com");
    expect(chatTranscriptRecipients("jane@example.com")).toEqual({
      to: "jane@example.com",
      cc: ["admin@mpillow.test", "sg@mpillow.com"],
      replyTo: ["admin@mpillow.test", "jane@example.com"],
    });
  });

  it("copies nobody twice when the customer typed a staff address", () => {
    expect(chatTranscriptRecipients("SG@mpillow.com")).toEqual({
      to: "SG@mpillow.com",
      cc: ["admin@mpillow.test"],
      replyTo: ["admin@mpillow.test", "SG@mpillow.com"],
    });
    expect(chatTranscriptRecipients("Admin@MPillow.test")).toEqual({
      to: "Admin@MPillow.test",
      cc: ["sg@mpillow.com"],
      replyTo: ["admin@mpillow.test"],
    });
  });

  it("compares addresses without case or display name", () => {
    expect(uniqueAddresses(["mpillow <sg@mpillow.com>", "SG@mpillow.com", "a@x.test"])).toEqual([
      "mpillow <sg@mpillow.com>",
      "a@x.test",
    ]);
  });
});

describe("renderChatTranscriptEmail", () => {
  it("carries the whole chat, both sides, under one subject per chat", () => {
    const { subject, text, html } = renderChatTranscriptEmail(TRANSCRIPT);
    expect(subject).toBe("Your chat with mpillow (#3F9A2C)");
    expect(text).toContain("Hi Jane Tan,");
    expect(text).toContain("We've replied to your chat.");
    expect(text).toContain("You · ");
    expect(text).toContain("Can I come in on Saturday for an adjustment?");
    expect(text).toContain("Darren (mpillow team)");
    expect(text).toContain("Yes, 11am works.");
    expect(text).toContain("Didn't chat with us?");
    expect(html).toContain("Your chat with mpillow");
    expect(renderChatTranscriptEmail({ ...TRANSCRIPT, reason: "ended" }).subject).toBe(subject);
  });

  it("opens with why it was sent", () => {
    expect(renderChatTranscriptEmail({ ...TRANSCRIPT, reason: "ended" }).text).toContain("Here's a copy of your chat with us.");
    expect(renderChatTranscriptEmail({ ...TRANSCRIPT, reason: "left" }).text).toContain("so far");
  });

  it("links back to the chat only for an account, whose session can open it", () => {
    const url = "https://custom.mpillow.com/support?chat=3f9a2c41-7d0e-4b8a-9c55-1e2f3a4b5c6d#contact";
    expect(renderChatTranscriptEmail(TRANSCRIPT).text).not.toContain(url);
    const withAccount = renderChatTranscriptEmail({ ...TRANSCRIPT, hasAccount: true });
    expect(withAccount.text).toContain(url);
    expect(withAccount.html).toContain("Open your chat");
  });

  it("greets without a name when there is none", () => {
    expect(renderChatTranscriptEmail({ ...TRANSCRIPT, name: null }).text.startsWith("Hi,\n")).toBe(true);
  });
});

describe("Cc and a list Reply-To in the transports", () => {
  const email: OutgoingEmail = {
    to: "jane@example.com",
    cc: ["admin@mpillow.test", "sg@mpillow.com"],
    replyTo: ["admin@mpillow.test", "jane@example.com"],
    from: "mpillow <orders@mpillow.test>",
    subject: "Your chat with mpillow (#3F9A2C)",
    text: "Hello there, this is the text body.",
    html: "<p>Hello</p>",
  };
  const mimeHeaders = (e: OutgoingEmail) =>
    Buffer.from(buildRawMessage(e), "base64url").toString("utf8").split("\r\n\r\n")[0].split("\r\n");

  it("Gmail writes them as address lists", () => {
    const headers = mimeHeaders(email);
    expect(headers).toContain("Cc: admin@mpillow.test, sg@mpillow.com");
    expect(headers).toContain("Reply-To: admin@mpillow.test, jane@example.com");
  });

  it("Gmail writes no Cc when there is none, and a single Reply-To as before", () => {
    const headers = mimeHeaders({ ...email, cc: [], replyTo: "jane@example.com" });
    expect(headers.some((h) => h.startsWith("Cc:"))).toBe(false);
    expect(headers).toContain("Reply-To: jane@example.com");
  });

  it("Gmail refuses an address with a line break", () => {
    expect(() => buildRawMessage({ ...email, cc: ["a@x.test\r\nBcc: victim@x.test"] })).toThrow(/line break/);
    expect(() => buildRawMessage({ ...email, replyTo: "a@x.test\nBcc: victim@x.test" })).toThrow(/line break/);
  });

  it("Resend passes them as its cc and reply_to fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const resend = new ResendTransport("re_test");
    await resend.send(email);
    await resend.send({ ...email, cc: undefined, replyTo: undefined });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].cc).toEqual(["admin@mpillow.test", "sg@mpillow.com"]);
    expect(bodies[0].reply_to).toEqual(["admin@mpillow.test", "jane@example.com"]);
    expect(bodies[1]).not.toHaveProperty("cc");
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });
});
