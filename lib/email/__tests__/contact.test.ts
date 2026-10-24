import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_CC, contactRecipients, renderContactEmail } from "../contact";
import { ResendTransport, buildRawMessage } from "../transport";
import type { OutgoingEmail } from "../types";

/**
 * A Contact Us message is one email: To the support inbox, Cc the customer and
 * sg@mpillow.com, Reply-To the inbox and the customer. The customer reads it
 * too, so it is written to them.
 */

const MSG = {
  name: "Jane Tan",
  email: "jane@example.com",
  subject: "Pillow height",
  message: "Can I come in on Saturday for an adjustment?",
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

describe("contactRecipients", () => {
  it("sends to the support inbox with the customer and sg@ on Cc", () => {
    expect(CONTACT_CC).toBe("sg@mpillow.com");
    expect(contactRecipients("jane@example.com")).toEqual({
      to: "admin@mpillow.test",
      cc: ["jane@example.com", "sg@mpillow.com"],
      replyTo: ["admin@mpillow.test", "jane@example.com"],
    });
  });

  it("copies nobody twice when the customer typed a staff address", () => {
    expect(contactRecipients("SG@mpillow.com")).toEqual({
      to: "admin@mpillow.test",
      cc: ["SG@mpillow.com"],
      replyTo: ["admin@mpillow.test", "SG@mpillow.com"],
    });
    expect(contactRecipients("Admin@MPillow.test")).toEqual({
      to: "admin@mpillow.test",
      cc: ["sg@mpillow.com"],
      replyTo: ["admin@mpillow.test"],
    });
  });

  it("leaves sg@ off Cc when it is already the support inbox", () => {
    process.env.SUPPORT_EMAIL = "mpillow <sg@mpillow.com>";
    expect(contactRecipients("jane@example.com").cc).toEqual(["jane@example.com"]);
  });
});

describe("renderContactEmail", () => {
  it("reads as the customer's copy and carries the whole message", () => {
    const { subject, text, html } = renderContactEmail(MSG);
    expect(subject).toBe("Contact Us: Pillow height");
    expect(text).toContain("Hi Jane Tan, this is a copy of the message you sent");
    expect(text).toContain(MSG.message);
    expect(text).toContain("Didn't send this?");
    expect(html).toContain("Thanks for getting in touch");
    expect(html).toContain("Pillow height");
  });

  it("names the sender in the subject when there is no subject", () => {
    expect(renderContactEmail({ ...MSG, subject: null }).subject).toBe("Contact Us: message from Jane Tan");
    expect(renderContactEmail({ ...MSG, subject: null }).text).not.toContain("Subject:");
  });
});

describe("Cc and a list Reply-To in the transports", () => {
  const email: OutgoingEmail = {
    to: "admin@mpillow.test",
    cc: ["jane@example.com", "sg@mpillow.com"],
    replyTo: ["admin@mpillow.test", "jane@example.com"],
    from: "mpillow <orders@mpillow.test>",
    subject: "Contact Us: Pillow height",
    text: "Hello there, this is the text body.",
    html: "<p>Hello</p>",
  };
  const mimeHeaders = (e: OutgoingEmail) =>
    Buffer.from(buildRawMessage(e), "base64url").toString("utf8").split("\r\n\r\n")[0].split("\r\n");

  it("Gmail writes them as address lists", () => {
    const headers = mimeHeaders(email);
    expect(headers).toContain("Cc: jane@example.com, sg@mpillow.com");
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
    expect(bodies[0].cc).toEqual(["jane@example.com", "sg@mpillow.com"]);
    expect(bodies[0].reply_to).toEqual(["admin@mpillow.test", "jane@example.com"]);
    expect(bodies[1]).not.toHaveProperty("cc");
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });
});
