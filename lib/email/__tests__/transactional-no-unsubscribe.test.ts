// Deterministic origin, as the contract test sets it, before the registry imports base.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import { renderEmailShell } from "../base";
import { sendOrderEmail } from "../index";
import { ResendTransport, buildRawMessage, extraHeaders } from "../transport";
import type { EmailTransport, OutgoingEmail } from "../types";
import { sampleOrder } from "../__fixtures__/samples";

/**
 * Campaign mail carries an unsubscribe link and `List-Unsubscribe`; order,
 * Result and aftercare mail carries neither, because it is transactional
 * (migration slice 07; ADR 0029 i). The transports pass extra headers through,
 * and refuse one that could rewrite the message.
 */

const UNSUB_URL = "https://custom.mpillow.com/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc";
const ONE_CLICK = {
  "List-Unsubscribe": "<https://custom.mpillow.com/api/email/unsubscribe?u=x&t=y>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

const sample: OutgoingEmail = {
  to: "a@x.test",
  from: "Mpillow <hello@mpillow.com>",
  subject: "Hello",
  text: "Hello there, this is the text body.",
  html: "<p>Hello</p>",
};

/** The MIME headers of a Gmail raw message, as one string. */
const mimeHeaders = (email: OutgoingEmail) => Buffer.from(buildRawMessage(email), "base64url").toString("utf8").split("\r\n\r\n")[0];

describe("transactional mail carries no unsubscribe", () => {
  const transactional = EMAIL_REGISTRY.filter((c) => !c.campaign);

  it("checks every registered template that is not a campaign", () => {
    expect(transactional.length).toBeGreaterThan(20);
  });

  it.each(transactional.map((c) => [c.id, c] as const))("%s has no unsubscribe link", (_id, entry) => {
    const { html, text } = entry.render("happy");
    expect(html).not.toMatch(/unsubscribe/i);
    expect(text).not.toMatch(/unsubscribe/i);
  });

  it.each(EMAIL_REGISTRY.filter((c) => c.campaign).map((c) => [c.id, c] as const))(
    "%s, a campaign, has one",
    (_id, entry) => {
      expect(entry.render("happy").html).toMatch(/\/unsubscribe\?u=/);
    },
  );

  it("an order email is handed to the transport with no extra headers", async () => {
    const sent: OutgoingEmail[] = [];
    const fake: EmailTransport = { name: "fake", send: async (e) => (sent.push(e), { id: "1" }) };
    await sendOrderEmail("order_confirmation", "a@x.test", sampleOrder("happy"), { transport: fake });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers).toBeUndefined();
    expect(mimeHeaders(sent[0])).not.toMatch(/List-Unsubscribe/i);
  });

  // Only the unsubscribe facility itself, and the email chrome that renders
  // it, may name these. A campaign sender (slice 08) joins the list on purpose;
  // a transactional sender that gains one fails here.
  it("nothing outside the unsubscribe facility sets the headers or the footer link", () => {
    const ALLOWED = new Set([
      "lib/marketing-consent/unsubscribe.ts",
      // The receiving end: it reads the one-click POST's body.
      "app/api/email/unsubscribe/route.ts",
      "lib/email/base.ts",
      "lib/email/components.ts",
      "lib/email/types.ts",
      "lib/email/registry.ts",
      // Migration slice 08, on purpose: the campaign emails, their preview
      // fixtures, and the wave sender that sets the headers.
      "lib/email/migration.ts",
      "lib/email/__fixtures__/samples.ts",
      "lib/customer-migration/wave-sender.ts",
      // PRD-email-marketing, on purpose: the campaigns Staff write, and their
      // sender, which sets the headers.
      "lib/email/campaigns.ts",
      "lib/email-campaigns/sender.ts",
      // PRD-campaign-email-editor slice 03: the same campaigns, built from blocks.
      "lib/email/campaign-blocks.ts",
      // ADR 0050, on purpose: the reminder to a guest who stopped customising
      // goes only with Marketing consent and is sent like a campaign.
      "lib/email/draft-reminder.ts",
      "lib/draft-reminders/server.ts",
    ]);
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) return [];
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return files(full);
        return /\.tsx?$/.test(name) && !/\.(test|check)\.tsx?$/.test(name) ? [full] : [];
      });
    const offenders = ["app", "lib", "components", "scripts"]
      .flatMap((d) => files(join(process.cwd(), d)))
      .filter((f) => /List-Unsubscribe|listUnsubscribeHeaders\(|unsubscribeUrl\s*:/.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f))
      .filter((f) => !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });
});

describe("renderEmailShell's unsubscribeUrl", () => {
  it("renders the footer link only when given", () => {
    const campaign = renderEmailShell({ bodyHtml: "<p>news</p>", unsubscribeUrl: UNSUB_URL });
    expect(campaign).toContain(`href="${UNSUB_URL.replace(/&/g, "&amp;")}"`);
    expect(campaign).toMatch(/>Unsubscribe<\/a>/);
    expect(renderEmailShell({ bodyHtml: "<p>order</p>" })).not.toMatch(/unsubscribe/i);
  });

  it("drops a URL safeUrl rejects rather than render a dead or hostile link", () => {
    expect(renderEmailShell({ bodyHtml: "", unsubscribeUrl: "javascript:alert(1)" })).not.toMatch(/unsubscribe|javascript:/i);
  });
});

describe("OutgoingEmail.headers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Gmail writes them into the MIME headers", () => {
    const headers = mimeHeaders({ ...sample, headers: ONE_CLICK });
    expect(headers).toContain(`List-Unsubscribe: ${ONE_CLICK["List-Unsubscribe"]}`);
    expect(headers).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    // Still before the body, and the message is still one message.
    expect(headers).toContain("MIME-Version: 1.0");
    expect(mimeHeaders(sample)).not.toContain("List-Unsubscribe");
  });

  it("Gmail RFC 2047-encodes a non-ASCII value", () => {
    expect(mimeHeaders({ ...sample, headers: { "X-Note": "café" } })).toContain(
      `X-Note: =?UTF-8?B?${Buffer.from("café").toString("base64")}?=`,
    );
  });

  it("Resend passes them as its headers field, and sends none when there are none", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const resend = new ResendTransport("re_test");
    await resend.send({ ...sample, headers: ONE_CLICK });
    await resend.send(sample);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].headers).toEqual(ONE_CLICK);
    expect(bodies[1]).not.toHaveProperty("headers");
  });

  it("refuses a header that could rewrite the message", () => {
    expect(() => extraHeaders({ "X-Ok": "a\r\nBcc: victim@x.test" })).toThrow(/line break/);
    expect(() => extraHeaders({ "X-Ok": "a\nb" })).toThrow(/line break/);
    expect(() => extraHeaders({ "Bad Name": "x" })).toThrow(/Invalid email header name/);
    expect(() => extraHeaders({ "Bad:Name": "x" })).toThrow(/Invalid email header name/);
    for (const owned of ["From", "to", "BCC", "Subject", "Content-Type", "reply-to"]) {
      expect(() => extraHeaders({ [owned]: "x" }), owned).toThrow(/sets .* itself/);
    }
    expect(() => buildRawMessage({ ...sample, headers: { Subject: "spoof" } })).toThrow();
  });
});
