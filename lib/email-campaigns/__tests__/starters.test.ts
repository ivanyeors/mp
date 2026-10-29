// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { renderCampaignBlocksEmail } from "@/lib/email/campaign-blocks";
import { EMPTY_CAMPAIGN_WORDS } from "../clear-all";
import {
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  CONTENT_PLACEHOLDERS,
  contentWords,
  emptyBlock,
  imageAssetsIn,
  productsIn,
  type CampaignContent,
  type EmailBlock,
} from "../content";
import { CampaignDraftSchema, FIRST_CAMPAIGN_DRAFT, mentionsPoints } from "../rules";
import { renderCampaignPreview } from "../sender";
import {
  BLANK_PREVIEW,
  emailSaysNothing,
  INVITATION_STARTER,
  LAYOUT_STARTERS,
  PLAYBOOK_STARTERS,
  starterAudience,
  starterById,
  starterContent,
  starterDraft,
  startedFrom,
  STARTERS,
  type Starter,
} from "../starters";
import { SAMPLE_RECIPIENT, variableValues } from "../variables";

/**
 * Starters (PRD-campaign-email-editor slice 08, decision 8): ready-made
 * layouts made of the same Email blocks, in code. Every one renders through
 * the real renderer and passes the schema; the layouts' words are only
 * placeholders, with no photo, price, offer or review request of their own;
 * the sign-in invitation is the one with finished words, and its audience.
 */

const ORIGIN = "https://custom.mpillow.com";

/** Ids that count up, so two calls are told apart. */
const counter = () => {
  let n = 0;
  return () => `b${++n}`;
};

/** As a send renders it: no placeholders, every Variable a sample customer's. */
const sent = (content: CampaignContent) =>
  renderCampaignBlocksEmail({
    subject: "",
    preheader: null,
    content,
    greeting: true,
    values: variableValues(SAMPLE_RECIPIENT, content.fallbacks),
    buttonHref: () => `${ORIGIN}/shop`,
    unsubscribeUrl: `${ORIGIN}/unsubscribe`,
  });

/** A price, a percentage, a discount or a code, an offer, or a review or rating asked for. */
const OFFER = /S?\$\s?\d|\d+\s?%|\bdiscount|\b\d+\s?(?:%\s)?off\b|\bpromo|\bcoupon|\bcode\b|\bfree\b|\bsale\b|\bdeal\b/i;
const REVIEW = /\breview|\brating|\brate us|\bstars?\b|\bfeedback\b/i;

/** Each block's words, as a new block of its type starts them. */
const wordsOf = (b: EmailBlock) => contentWords({ v: 1, blocks: [b], fallbacks: {} });

describe("every Starter", () => {
  it.each(STARTERS.map((s) => [s.label, s] as const))("%s renders through the real renderer, light and on its placeholders, and passes the schema", (_label, s) => {
    const draft = starterDraft(s);
    const content = draft.content!;
    expect(CampaignContentPreviewSchema.parse(content)).toEqual(content);
    const preview = renderCampaignPreview(draft, { origin: ORIGIN, ...SAMPLE_RECIPIENT });
    expect(preview.html).toMatch(/^<!doctype html>/i);
    for (const b of content.blocks) expect(preview.html).toContain(`data-block-id="${b.id}"`);
    expect(() => sent(content)).not.toThrow();
  });

  it("is named as the slice names it, once each, and none is the blank email's thumbnail", () => {
    expect(STARTERS.map((s) => s.label)).toEqual(["Product launch", "Care tips", "Event or fitting day", "A short note", "New website: sign in for points"]);
    const ids = STARTERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(BLANK_PREVIEW);
    expect(starterById("care_tips")?.label).toBe("Care tips");
    expect(starterById("nope")).toBeNull();
    // The CRM's Playbooks join here when their words are approved (PRD-crm-retention-loop slice 07).
    expect(PLAYBOOK_STARTERS).toEqual([]);
  });

  it("is new blocks every time it is used: fresh ids, nothing shared with the last", () => {
    for (const s of STARTERS) {
      const a = s.blocks();
      const b = s.blocks();
      expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
      expect(new Set([...a, ...b].map((x) => x.id)).size).toBe(a.length * 2);
      a[0].id = "changed";
      expect(s.blocks()[0].id).not.toBe("changed");
    }
    const id = counter();
    expect(starterContent(LAYOUT_STARTERS[0], id).blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("asks for no review or rating", () => {
    for (const s of STARTERS) {
      const content = starterContent(s);
      expect(contentWords(content).join(" ")).not.toMatch(REVIEW);
      expect(sent(content).text).not.toMatch(REVIEW);
    }
  });
});

describe("the layouts", () => {
  const blocksOf = (s: Starter) =>
    s.blocks().map((b) => (b.type === "buttons" ? `buttons:${b.buttons.map((x) => x.target).join("+")}` : b.type === "heading" ? `heading${b.level}` : b.type));

  it("hold the blocks the slice names, in order", () => {
    expect(Object.fromEntries(LAYOUT_STARTERS.map((s) => [s.label, blocksOf(s)]))).toEqual({
      "Product launch": ["hero", "heading2", "text", "products", "buttons:shop"],
      // The tips are a text block: an empty bullet list holds no words to keep.
      "Care tips": ["heading1", "text", "split", "text", "buttons:shop"],
      "Event or fitting day": ["hero", "text", "buttons:book_fitting"],
      "A short note": ["heading1", "text", "buttons:shop"],
    });
  });

  it("have only placeholders for words: each block's words are a new block's of its type", () => {
    for (const s of LAYOUT_STARTERS) {
      // A hero or an image + text without its own button has a word fewer to write.
      for (const b of s.blocks()) expect(wordsOf(b).filter(Boolean), `${s.label}: ${b.type}`).toEqual(wordsOf(emptyBlock(b.type)).filter(Boolean));
      const content = starterContent(s);
      expect(contentWords(content).filter(Boolean)).toEqual(content.blocks.some((b) => b.type === "products") ? ["Shop now"] : []);
    }
  });

  it("have no photo, product, price or offer of their own: images and products are Staff's to choose", () => {
    for (const s of LAYOUT_STARTERS) {
      const content = starterContent(s);
      expect(imageAssetsIn(content)).toEqual([]);
      expect(productsIn(content)).toEqual([]);
      expect(JSON.stringify(content)).not.toMatch(/https?:/);
      expect(sent(content).text).not.toMatch(OFFER);
      expect(mentionsPoints(starterDraft(s))).toBe(false);
    }
  });

  it("draw a placeholder where each word goes, in the preview only", () => {
    const launch = renderCampaignPreview(starterDraft(LAYOUT_STARTERS[0]), { origin: ORIGIN, ...SAMPLE_RECIPIENT });
    for (const hint of [CONTENT_PLACEHOLDERS.image, CONTENT_PLACEHOLDERS.heading, CONTENT_PLACEHOLDERS.line, CONTENT_PLACEHOLDERS.text, CONTENT_PLACEHOLDERS.products]) {
      expect(launch.html).toContain(hint);
    }
    const asSent = sent(starterContent(LAYOUT_STARTERS[0]));
    for (const hint of Object.values(CONTENT_PLACEHOLDERS)) expect(asSent.html).not.toContain(hint);
  });

  it("can't be saved, or sent, until their words are written: Save's schema names each empty field", () => {
    for (const s of LAYOUT_STARTERS) {
      const parsed = CampaignContentSchema.safeParse(starterContent(s));
      expect(parsed.success, s.label).toBe(false);
      expect(CampaignDraftSchema.safeParse({ ...starterDraft(s), subject: "Hello" }).success).toBe(false);
    }
  });

  it("send to whoever the email goes to: they bring no audience", () => {
    for (const s of LAYOUT_STARTERS) expect(s.audience).toBeUndefined();
  });
});

describe("the sign-in invitation", () => {
  const s = INVITATION_STARTER;

  it("is today's invitation as blocks, its words finished, with its audience", () => {
    expect(s.label).toBe(FIRST_CAMPAIGN_DRAFT.name);
    expect(s.words).toEqual({ name: FIRST_CAMPAIGN_DRAFT.name, subject: FIRST_CAMPAIGN_DRAFT.subject, preheader: FIRST_CAMPAIGN_DRAFT.preheader });
    expect(s.audience).toEqual({ audience: FIRST_CAMPAIGN_DRAFT.audience });
    const words = contentWords(starterContent(s)).join("\n");
    expect(words).toContain("There's nothing to fill in and no password to set");
    expect(words).toContain(FIRST_CAMPAIGN_DRAFT.button!.label);
  });

  it("passes Save's schema as it is: the one Starter with finished words", () => {
    expect(CampaignContentSchema.safeParse(starterContent(s)).success).toBe(true);
    expect(CampaignDraftSchema.safeParse(starterDraft(s)).success).toBe(true);
  });

  it("offers only the Claim bonus, which the points rule holds back until points are live", () => {
    const draft = starterDraft(s);
    expect(mentionsPoints(draft)).toBe(true);
    expect(sent(starterContent(s)).text).toContain("1,000 points");
    expect(starterContent(s).blocks.some((b) => b.type === "buttons" && b.buttons[0].target === "sign_in")).toBe(true);
  });
});

describe("starting an email from a Starter", () => {
  const SEGMENTS = [{ id: "5e000000-0000-4000-8000-000000000001", name: "New" }];
  const empty = { ...EMPTY_CAMPAIGN_WORDS, greeting: false, audience: "subscribed" as const, segmentId: "" };

  it("puts its blocks in, and keeps the name, audience and greeting of a layout", () => {
    const blocks = LAYOUT_STARTERS[3].blocks(counter());
    const next = startedFrom({ ...empty, name: "December" }, LAYOUT_STARTERS[3], blocks, SEGMENTS);
    expect(next).toEqual({ ...empty, name: "December", content: { v: 1, blocks, fallbacks: {} } });
  });

  it("fills the invitation's words and sends it to the imported customers", () => {
    const blocks = INVITATION_STARTER.blocks();
    const next = startedFrom({ ...empty, name: "Premium, lapsed", audience: "segment", segmentId: SEGMENTS[0].id }, INVITATION_STARTER, blocks, SEGMENTS);
    expect(next).toMatchObject({
      name: FIRST_CAMPAIGN_DRAFT.name,
      subject: FIRST_CAMPAIGN_DRAFT.subject,
      preheader: FIRST_CAMPAIGN_DRAFT.preheader,
      audience: "imported_not_signed_in",
      greeting: false,
      content: { blocks },
    });
  });

  it("makes a cleared message written before blocks a block campaign, its fallbacks kept", () => {
    const legacy = { ...empty, body: "", button: { choice: "none" as const, label: "Old", url: "" }, content: null };
    expect(startedFrom(legacy, LAYOUT_STARTERS[0], [], SEGMENTS)).toMatchObject({ body: "", button: { choice: "none", label: "", url: "" }, content: { v: 1, blocks: [], fallbacks: {} } });
    const kept = { ...empty, content: { v: 1 as const, blocks: [], fallbacks: { first_name: "friend" } } };
    expect(startedFrom(kept, LAYOUT_STARTERS[0], [], SEGMENTS).content?.fallbacks).toEqual({ first_name: "friend" });
  });

  it("sends a Playbook to its stage's Segment, found by name, or leaves the Segment to choose", () => {
    const playbook: Starter = { ...LAYOUT_STARTERS[3], id: "second_purchase", audience: { audience: "segment", segment: "New" } };
    expect(starterAudience(playbook, SEGMENTS)).toEqual({ audience: "segment", segmentId: SEGMENTS[0].id });
    expect(starterAudience(playbook, [])).toEqual({ audience: "segment", segmentId: "" });
    expect(starterAudience(LAYOUT_STARTERS[0], SEGMENTS)).toEqual({});
  });

  it("is offered while the email says nothing, whatever it is named", () => {
    expect(emailSaysNothing(EMPTY_CAMPAIGN_WORDS)).toBe(true);
    expect(emailSaysNothing({ ...EMPTY_CAMPAIGN_WORDS, name: "Premium, lapsed" })).toBe(true);
    expect(emailSaysNothing({ ...EMPTY_CAMPAIGN_WORDS, subject: "Hi" })).toBe(false);
    expect(emailSaysNothing({ ...EMPTY_CAMPAIGN_WORDS, content: starterContent(LAYOUT_STARTERS[3]) })).toBe(false);
    expect(emailSaysNothing({ ...EMPTY_CAMPAIGN_WORDS, content: null, button: { choice: "sign_in", label: "", url: "" } })).toBe(false);
  });
});
