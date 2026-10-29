process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { COMPOSED_CAMPAIGN_NOTE, parseCampaignBody, renderComposedCampaignEmail } from "../campaigns";
import { getEmailCase } from "../registry";
import { HOSTILE } from "../__fixtures__/samples";

const UNSUB = "https://custom.mpillow.com/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc";
const base = { subject: "News", preheader: null, greeting: true, firstName: "Ann", button: null, unsubscribeUrl: UNSUB };

describe("parseCampaignBody", () => {
  it("reads paragraphs, bullets and headings from plain text", () => {
    expect(
      parseCampaignBody("First line\nsame paragraph\n\n## Heading\n- one\n* two\n\n\nLast"),
    ).toEqual([
      { kind: "paragraph", lines: ["First line", "same paragraph"] },
      { kind: "heading", text: "Heading" },
      { kind: "bullets", items: ["one", "two"] },
      { kind: "paragraph", lines: ["Last"] },
    ]);
  });

  it("drops empty bullets and headings, and handles Windows line ends", () => {
    expect(parseCampaignBody("-  \r\n## \r\ntext")).toEqual([{ kind: "paragraph", lines: ["text"] }]);
  });
});

describe("renderComposedCampaignEmail", () => {
  it("greets by first name, or plainly, or not at all", () => {
    expect(renderComposedCampaignEmail({ ...base, body: "Hello" }).text).toMatch(/^Hi Ann,\n/);
    expect(renderComposedCampaignEmail({ ...base, firstName: null, body: "Hello" }).text).toMatch(/^Hi,\n/);
    expect(renderComposedCampaignEmail({ ...base, greeting: false, body: "Hello" }).text).toMatch(/^Hello\n/);
  });

  it("escapes everything Staff type: no markup gets through", () => {
    const r = renderComposedCampaignEmail({ ...base, subject: HOSTILE, preheader: HOSTILE, firstName: HOSTILE, body: `${HOSTILE}\n- ${HOSTILE}\n## ${HOSTILE}` });
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).not.toContain("</script>");
    expect(r.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("links https addresses, shown without the https://, and leaves anything else as text", () => {
    const r = renderComposedCampaignEmail({ ...base, body: "See https://custom.mpillow.com/en-US/faq. Or javascript:alert(1) or http://old.example." });
    expect(r.html).toContain('href="https://custom.mpillow.com/en-US/faq"');
    expect(r.html).toContain(">custom.mpillow.com/en-US/faq</a>.");
    expect(r.html).not.toContain('href="javascript');
    expect(r.html).not.toContain('href="http://old');
  });

  it("renders the button when there is one, and in the text version", () => {
    const r = renderComposedCampaignEmail({ ...base, body: "Hi", button: { label: "Sign in", href: "https://custom.mpillow.com/en-US/account" } });
    expect(r.html).toContain('href="https://custom.mpillow.com/en-US/account"');
    expect(r.text).toContain("Sign in: https://custom.mpillow.com/en-US/account");
    expect(renderComposedCampaignEmail({ ...base, body: "Hi" }).html).not.toContain("en-US/account");
  });

  it("always carries the consent note and the unsubscribe link", () => {
    const r = renderComposedCampaignEmail({ ...base, body: "Hi" });
    expect(r.html).toContain(COMPOSED_CAMPAIGN_NOTE.replace(/'/g, "&#39;"));
    expect(r.html).toMatch(/\/unsubscribe\?u=/);
    expect(r.text).toContain(`Unsubscribe: ${UNSUB}`);
  });

  it("draws an empty field's placeholder, dashed and muted, only when the preview passes them", () => {
    const placeholders = { subject: "e.g. Sleep cooler", body: "Write your message.", buttonLabel: "e.g. Shop <the> covers" };
    const empty = { ...base, subject: "", body: "", button: { label: "", href: "https://custom.mpillow.com/en-US/account" } };
    const preview = renderComposedCampaignEmail({ ...empty, placeholders }).html;
    for (const hint of ["e.g. Sleep cooler", "Write your message.", "e.g. Shop &lt;the&gt; covers"]) expect(preview).toContain(hint);
    expect(preview.match(/border:1px dashed/g)).toHaveLength(3);
    expect(preview).toMatch(/<h1 class="mp-muted"[^>]*>e\.g\. Sleep cooler<\/h1>/);
    // A button without words has no link to press, even in the preview.
    expect(preview).not.toContain('href="https://custom.mpillow.com/en-US/account"');

    const sent = renderComposedCampaignEmail(empty);
    expect(sent.html).not.toContain("dashed");
    expect(sent.html).not.toMatch(/<h1/);
    expect(sent.html).not.toContain("en-US/account");
    expect(sent.text).not.toContain("en-US/account");
  });

  it("draws no placeholder over words: a typed field shows what was typed", () => {
    const placeholders = { subject: "e.g. Sleep cooler", body: "Write your message.", buttonLabel: "e.g. Shop" };
    const r = renderComposedCampaignEmail({ ...base, body: "Hello", button: { label: "Sign in", href: "https://custom.mpillow.com/en-US/account" }, placeholders });
    expect(r.html).not.toContain("dashed");
    for (const hint of Object.values(placeholders)) expect(r.html).not.toContain(hint);
    expect(r.html).toContain(">News</h1>");
  });

  it("is registered as campaign mail", () => {
    expect(getEmailCase("campaign.composed")).toMatchObject({ group: "campaign", audience: "customer", campaign: true });
  });
});
