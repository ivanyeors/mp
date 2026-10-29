// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { renderCampaignBlocksEmail, type CampaignBlocksEmailData } from "../campaign-blocks";
import { renderComposedCampaignEmail } from "../campaigns";
import { stripTags } from "../html";
import { getEmailCase } from "../registry";
import { HOSTILE, sampleCampaignBlocks, sampleComposedCampaign, WORDS_PROBE } from "../__fixtures__/samples";
import { contentFromLegacy, type CampaignContent, type Run } from "@/lib/email-campaigns/content";
import { renderCampaignFor } from "@/lib/email-campaigns/sender";
import { FIRST_CAMPAIGN_DRAFT, type CampaignDraft } from "@/lib/email-campaigns/rules";

/**
 * The block renderer (PRD-campaign-email-editor slice 03): the blocks into
 * the shared components inside the shell, every word escaped, nothing typed
 * ever markup, and a plain-text part from the same blocks.
 */

const ORIGIN = "https://custom.mpillow.com";
const UNSUB = `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc`;
const HINTS = { heading: "e.g. A heading", text: "Write a few lines.", buttonLabel: "e.g. Shop", empty: "Add a block." };

const data = (content: CampaignContent, over: Partial<CampaignBlocksEmailData> = {}): CampaignBlocksEmailData => ({
  subject: "News",
  preheader: null,
  content,
  greeting: false,
  firstName: "Ann",
  values: { first_name: "Ann" },
  buttonHref: (b) => (b.target === "url" ? b.url! : `${ORIGIN}/en-US/${b.target}`),
  unsubscribeUrl: UNSUB,
  ...over,
});
const one = (...blocks: CampaignContent["blocks"]): CampaignContent => ({ v: 1, blocks, fallbacks: {} });
const textBlock = (...runs: Run[]) => one({ id: "t", type: "text", paragraphs: [{ kind: "p", runs }] });

/** What a reader sees inside the card: the words, in order. */
const words = (html: string) => {
  const card = html.indexOf(">", html.indexOf('class="mp-card mp-pad"')) + 1;
  return stripTags(html.slice(card, html.indexOf("You&#39;re getting this")));
};

describe("renderCampaignBlocksEmail", () => {
  it("renders the sample: a title, bold, a link that reads as its words, bullets, two buttons, a divider and a spacer", () => {
    const r = renderCampaignBlocksEmail(sampleCampaignBlocks("happy"));
    expect(r.subject).toBe("Wei Ling, sleep cooler this December");
    expect(r.html).toContain("<title>Wei Ling, sleep cooler this December</title>");
    expect(r.html).toMatch(/<h1 class="mp-fg"[^>]*>Sleep cooler this December<\/h1>/);
    expect(r.html).toContain("Our <strong>FibreCool</strong> covers are back, Wei Ling, in every size.");
    expect(r.html).toMatch(/<a class="mp-fg" href="https:\/\/custom\.mpillow\.com\/en-US\/faq"[^>]*>the care guide<\/a>/);
    expect(r.html).toContain("&bull;&nbsp;&nbsp;<em>Machine </em>washable");
    // Two buttons in one row of two columns that fall to one on a phone, with Outlook's ghost table.
    expect(r.html.match(/max-width:240px/g)).toHaveLength(2);
    expect(r.html).toContain('<!--[if mso]></td><td width="50%" valign="top"><![endif]-->');
    expect(r.html).toContain("mp-btn-cell-secondary");
    expect(r.html.match(/<v:roundrect/g)).toHaveLength(2);
    expect(r.html).toContain('class="mp-border"');
    expect(r.html).toMatch(/\/unsubscribe\?u=/);
    expect(r.text).toBe(
      [
        "Sleep cooler this December",
        "",
        "Hi Wei Ling,",
        "",
        "Our FibreCool covers are back, Wei Ling, in every size. Read the care guide before you wash yours.",
        "the care guide: https://custom.mpillow.com/en-US/faq",
        "",
        "- Cool to the touch",
        "- Machine washable",
        "",
        "Shop the covers: https://custom.mpillow.com/en-US/shop?utm_source=email_campaign&utm_medium=email&utm_campaign=december-cooling-launch",
        "Book a fitting: https://custom.mpillow.com/en-US/appointments?utm_source=email_campaign&utm_medium=email&utm_campaign=december-cooling-launch",
        "",
        "---",
        "",
        "Questions? Just reply to this email.",
        "",
        "You're getting this because you agreed to receive emails from Mpillow.",
        `Unsubscribe: ${sampleCampaignBlocks().unsubscribeUrl}`,
      ].join("\n"),
    );
  });

  it("escapes every word, the recipient's name included, and keeps the probe whole in the plain text", () => {
    const r = renderCampaignBlocksEmail(sampleCampaignBlocks("hostile"));
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(r.html).toContain("&quot;Quotes&quot; &amp; &lt;3 &#39;apostrophes&#39;");
    expect(r.text).toContain(HOSTILE);
    expect(r.text).toContain(WORDS_PROBE);
  });

  it("throws on what the schema refuses, rather than render it", () => {
    const crafted: unknown[] = [
      one({ id: "x", type: "html", html: "<script>alert(1)</script>" } as never),
      one({ id: "x", type: "divider", html: "<hr>" } as never),
      textBlock({ text: "<script>alert(1)</script>" }),
      textBlock({ text: "Click", href: "javascript:alert(1)" }),
      one({ id: "b", type: "buttons", buttons: [{ label: "Go", target: "url", url: "javascript:alert(1)", style: "primary" }] }),
      textBlock({ var: "last_name" } as never),
      { v: 1, blocks: [] },
    ];
    for (const c of crafted) expect(() => renderCampaignBlocksEmail(data(c as CampaignContent)), JSON.stringify(c)).toThrow();
  });

  it("fills a Variable for the recipient, in the words, the subject and the preview line", () => {
    const r = renderCampaignBlocksEmail(
      data(textBlock({ text: "Hello " }, { var: "first_name" }, { text: "!" }), {
        subject: "{first_name}, sleep cooler",
        preheader: "For {first_name}",
        values: { first_name: "there" },
      }),
    );
    expect(r.subject).toBe("there, sleep cooler");
    expect(r.html).toContain(">Hello there!</p>");
    expect(r.html).toContain("For there");
    expect(r.text).toContain("Hello there!");
  });

  it("opens with the greeting after the title the email opens with", () => {
    const c = one(
      { id: "h", type: "heading", level: 1, text: "Title" },
      { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Body" }] }] },
      { id: "s", type: "heading", level: 2, text: "Part" },
    );
    expect(words(renderCampaignBlocksEmail(data(c, { greeting: true })).html)).toBe("Title Hi Ann, Body Part");
    expect(words(renderCampaignBlocksEmail(data(one({ id: "d", type: "divider" }), { greeting: true, firstName: null })).html)).toBe("Hi,");
    expect(renderCampaignBlocksEmail(data(c)).text).not.toContain("Hi Ann");
    // After the title, before a part's heading, as a legacy campaign's greeting sits.
    const parts = one(
      { id: "h", type: "heading", level: 1, text: "Title" },
      { id: "s", type: "heading", level: 2, text: "Care" },
      { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Body" }] }] },
    );
    expect(words(renderCampaignBlocksEmail(data(parts, { greeting: true })).html)).toBe("Title Hi Ann, Care Body");
  });

  it("previews the words after the title in the inbox when there is no preview line, each button once", () => {
    const c = one(
      { id: "h", type: "heading", level: 1, text: "News" },
      { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Short note." }] }] },
      { id: "b", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
    );
    const inbox = (html: string) => /mso-hide:all">([^<]*?)&zwnj;/.exec(html)?.[1];
    expect(inbox(renderCampaignBlocksEmail(data(c, { greeting: true })).html)).toBe("Hi Ann, Short note. Shop the covers");
    const pair = one(c.blocks[1], {
      id: "b",
      type: "buttons",
      buttons: [
        { label: "Shop", target: "shop", style: "primary" },
        { label: "Book", target: "book_fitting", style: "secondary" },
      ],
    });
    expect(inbox(renderCampaignBlocksEmail(data(pair)).html)).toBe("Short note. Shop Book");
  });

  it("keeps a line break inside a paragraph, and merges a link's runs into one link", () => {
    const r = renderCampaignBlocksEmail(
      data(textBlock({ text: "One\nTwo " }, { text: "our ", href: `${ORIGIN}/x` }, { text: "guide", href: `${ORIGIN}/x`, bold: true })),
    );
    expect(r.html).toContain("One<br />Two ");
    expect(r.html.match(/href="https:\/\/custom\.mpillow\.com\/x"/g)).toHaveLength(1);
    expect(r.html).toMatch(/>our <strong>guide<\/strong><\/a>/);
    expect(r.text).toContain("One\nTwo our guide\nour guide: https://custom.mpillow.com/x");
  });

  it("draws an empty field's placeholder only when the preview passes them", () => {
    const empty = one(
      { id: "h", type: "heading", level: 2, text: "" },
      { id: "t", type: "text", paragraphs: [] },
      { id: "b", type: "buttons", buttons: [{ label: "", target: "shop", style: "primary" }] },
    );
    const preview = renderCampaignBlocksEmail(data(empty, { placeholders: HINTS })).html;
    expect(preview).toMatch(/<h2 class="mp-muted"[^>]*>e\.g\. A heading<\/h2>/);
    expect(preview).toContain(">Write a few lines.</p>");
    expect(preview).toContain(">e.g. Shop</span>");
    expect(preview.match(/border:1px dashed/g)).toHaveLength(3);
    // A button without words has no link to press, even in the preview.
    expect(preview).not.toContain(`${ORIGIN}/en-US/shop`);
    expect(renderCampaignBlocksEmail(data(one(), { placeholders: HINTS })).html).toContain(">Add a block.</p>");

    const sent = renderCampaignBlocksEmail(data(empty));
    expect(sent.html).not.toContain("dashed");
    for (const hint of Object.values(HINTS)) expect(sent.html + sent.text).not.toContain(hint);
    expect(sent.html).not.toContain(`${ORIGIN}/en-US/shop`);
  });

  it("is registered as campaign mail", () => {
    expect(getEmailCase("campaign.blocks")).toMatchObject({ group: "campaign", audience: "customer", campaign: true });
  });
});

describe("a legacy draft converted to blocks", () => {
  const send = (c: CampaignDraft) =>
    renderCampaignFor(c, { firstName: "Ann", origin: ORIGIN, locale: "en-US", claimUrl: null, unsubscribeUrl: UNSUB });
  const convert = (c: CampaignDraft): CampaignDraft => ({ ...c, body: "", button: null, content: contentFromLegacy(c) });

  it("renders the same words, in the same order, as before", () => {
    const composed = sampleComposedCampaign("happy");
    const drafts: CampaignDraft[] = [
      FIRST_CAMPAIGN_DRAFT,
      { ...FIRST_CAMPAIGN_DRAFT, subject: composed.subject, preheader: composed.preheader, body: composed.body },
      { ...FIRST_CAMPAIGN_DRAFT, greeting: false, preheader: null, button: { target: "url", label: "Shop", url: `${ORIGIN}/en-US/shop` } },
    ];
    for (const d of drafts) {
      const before = send(d);
      const after = send(convert(d));
      expect(stripTags(after.html)).toBe(stripTags(before.html));
      expect(after.subject).toBe(before.subject);
    }
  });

  it("keeps the greeting after the title when the message opens with a heading", () => {
    for (const body of ["## Hello\nOur covers are back.", "## Care\nWash cold.\n\nDry flat."]) {
      const d = { ...FIRST_CAMPAIGN_DRAFT, body };
      expect(words(send(convert(d)).html)).toBe(words(send(d).html));
    }
  });

  it("still renders through the legacy renderer until it is converted", () => {
    expect(send(FIRST_CAMPAIGN_DRAFT).html).toBe(
      renderComposedCampaignEmail({
        subject: FIRST_CAMPAIGN_DRAFT.subject,
        preheader: FIRST_CAMPAIGN_DRAFT.preheader,
        body: FIRST_CAMPAIGN_DRAFT.body,
        greeting: true,
        firstName: "Ann",
        button: { label: FIRST_CAMPAIGN_DRAFT.button!.label, href: `${ORIGIN}/en-US/account?utm_source=email_campaign&utm_medium=email&utm_campaign=new-website-sign-in-for-points` },
        unsubscribeUrl: UNSUB,
      }).html,
    );
  });
});
