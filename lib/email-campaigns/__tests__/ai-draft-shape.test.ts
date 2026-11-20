import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DraftRequestSchema, blockFromDraft, draftOutputSchema, textBlockFromDraft } from "@/lib/email-campaigns/ai-draft-shape";
import {
  DRAFT_NEEDS_TITLE,
  draftBlocker,
  draftTitle,
  keepAiDrafted,
  markAiDrafted,
  withDraftBlocks,
  withDraftText,
  withEditedBlocks,
} from "@/lib/email-campaigns/ai-drafted";
import { aiDraftedBlocks, CampaignContentSchema, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";

const COVER = "0b6c1f2e-6a1d-4c55-9a77-2f0b9d3c1a10";
const NECK = "1c7d2a3f-7b2e-4d66-8b88-3a1c0e4d2b21";

describe("draftBlocker", () => {
  it("needs a subject of 3 words, or failing that the campaign name", () => {
    expect(draftBlocker("Sleep cooler", "")).toBe(DRAFT_NEEDS_TITLE);
    expect(draftBlocker("Sleep cooler this December", "")).toBeNull();
    expect(draftBlocker("", "December cooling launch")).toBeNull();
    expect(draftBlocker("  ", "Launch")).toBe(DRAFT_NEEDS_TITLE);
    expect(draftBlocker("{first_name}, sleep cooler", "")).toBeNull();
    expect(draftBlocker("Sleep — cooler", "")).toBe(DRAFT_NEEDS_TITLE);
    expect(draftTitle("", "  December   launch ")).toBe("December launch");
  });
});

describe("DraftRequestSchema", () => {
  const base = { campaignId: null, scope: "email", subject: "Sleep cooler this December", name: "", about: "", goal: null, products: [], existing: [] };
  it("takes a brief of at most 500 characters and 3 picked products", () => {
    expect(DraftRequestSchema.safeParse(base).success).toBe(true);
    expect(DraftRequestSchema.safeParse({ ...base, about: "x".repeat(501) }).success).toBe(false);
    expect(DraftRequestSchema.safeParse({ ...base, products: [COVER, NECK, COVER] }).success).toBe(false);
    expect(DraftRequestSchema.safeParse({ ...base, goal: "promotion", products: [COVER, NECK] }).success).toBe(true);
    expect(DraftRequestSchema.safeParse({ ...base, audience: "everyone" }).success).toBe(false);
  });
});

describe("draftOutputSchema", () => {
  const schemaText = (products: number) => JSON.stringify(betaZodOutputFormat(draftOutputSchema({ scope: "email", products })).schema);

  it("is flat and offers no link: no href, no url target, no image", () => {
    const text = schemaText(0);
    expect(text).not.toMatch(/href|"url"|image|hero|split/);
    expect(text).toContain("first_name");
    expect(text).not.toContain("last_name");
    expect(text).not.toMatch(/"products"|\\"product\\"/);
  });

  it("offers a products block and a product button only for picked products, by key", () => {
    const text = schemaText(2);
    expect(text).toContain('\\"p1\\",\\"p2\\"');
    expect(text).not.toContain("p3");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe("blockFromDraft", () => {
  it("gives the block its id and the first name Variable its run", () => {
    const made = blockFromDraft(
      { type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Sleep well, {first_name}." }, { text: "" }] }, { kind: "bullets", items: [[{ var: "first_name" }]] }] },
      "b1",
      [],
    );
    expect(made).toEqual({
      ok: true,
      block: {
        id: "b1",
        type: "text",
        paragraphs: [
          { kind: "p", runs: [{ text: "Sleep well, " }, { var: "first_name" }, { text: "." }] },
          { kind: "bullets", items: [[{ var: "first_name" }]] },
        ],
      },
    });
  });

  it("names picked products by key, and turns a product button's key into its product", () => {
    expect(blockFromDraft({ type: "products", products: ["p2", "p1", "p2"], layout: "rows", buttonLabel: "Shop now" }, "b2", [COVER, NECK])).toEqual({
      ok: true,
      block: { id: "b2", type: "products", products: [NECK, COVER], layout: "rows", buttonLabel: "Shop now" },
    });
    const made = blockFromDraft({ type: "buttons", buttons: [{ label: "See the cover", target: "product", product: "p1", style: "primary" }] }, "b3", [COVER]);
    expect(made.ok && made.block).toEqual({ id: "b3", type: "buttons", buttons: [{ label: "See the cover", target: "product", product: COVER, style: "primary" }] });
  });

  it.each([
    ["a link in the words", { type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Shop", href: "https://evil.example" }] }] }],
    ["a URL button", { type: "buttons", buttons: [{ label: "Go", target: "url", url: "https://evil.example", style: "primary" }] }],
    ["a product nobody picked", { type: "products", products: ["p3"], layout: "rows", buttonLabel: "Shop now" }],
    ["an image", { type: "image", image: { asset: COVER, alt: "x" }, width: "full" }],
    ["another Variable", { type: "text", paragraphs: [{ kind: "p", runs: [{ var: "points_balance" }] }] }],
    ["a heading too long to save", { type: "heading", level: 1, text: "x".repeat(121) }],
    ["a button with no label", { type: "buttons", buttons: [{ label: " ", target: "shop", style: "primary" }] }],
    ["HTML", { type: "heading", level: 2, text: "<b>Cool</b>" }],
  ])("refuses %s", (_, raw) => {
    expect(blockFromDraft(raw, "b4", [COVER])).toMatchObject({ ok: false, problem: expect.any(String) });
  });

  it("checks one text block's words the same way", () => {
    expect(textBlockFromDraft([{ kind: "p", runs: [{ text: "Cool nights." }] }], "t1")).toEqual({
      ok: true,
      block: { id: "t1", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Cool nights." }] }] },
    });
    expect(textBlockFromDraft([], "t1").ok).toBe(false);
  });
});

describe("Drafted with AI", () => {
  const heading: EmailBlock = { id: "h", type: "heading", level: 1, text: "Sleep cooler" };
  const text: EmailBlock = { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Cool." }] }] };
  const mine: EmailBlock = { id: "m", type: "divider" };
  const content: CampaignContent = markAiDrafted({ v: 1, blocks: [mine, heading, text], fallbacks: {} }, ["h", "t"]);

  it("marks the blocks Claude wrote, saved with the content", () => {
    expect(content.aiDrafted).toEqual(["h", "t"]);
    expect(aiDraftedBlocks(content).map((b) => b.id)).toEqual(["h", "t"]);
    expect(CampaignContentSchema.safeParse(content).success).toBe(true);
  });

  it("unmarks a block a person edits or deletes, and keeps it through a move", () => {
    const edited = withEditedBlocks(content, [mine, { ...heading, text: "Sleep cooler tonight" }, text]);
    expect(edited.aiDrafted).toEqual(["t"]);
    const moved = withEditedBlocks(content, [text, heading, mine]);
    expect(moved.aiDrafted).toEqual(["h", "t"]);
    const gone = withEditedBlocks(content, [mine]);
    expect(gone).not.toHaveProperty("aiDrafted");
  });

  it("lands a draft's blocks in place of the email's, or below them, marked; a restart takes them out again", () => {
    const one: EmailBlock = { id: "d1", type: "divider" };
    const two: EmailBlock = { id: "d2", type: "heading", level: 2, text: "Cool" };
    const ever = new Set(["d1", "d2"]);
    const replaced = withDraftBlocks(content, [one, two], { mode: "replace", ever });
    expect(replaced.blocks.map((b) => b.id)).toEqual(["d1", "d2"]);
    expect(replaced.aiDrafted).toEqual(["d1", "d2"]);
    const added = withDraftBlocks(content, [one], { mode: "add", ever });
    expect(added.blocks.map((b) => b.id)).toEqual(["m", "h", "t", "d1"]);
    expect(added.aiDrafted).toEqual(["h", "t", "d1"]);
    const restarted = withDraftBlocks(added, [], { mode: "add", ever });
    expect(restarted.blocks.map((b) => b.id)).toEqual(["m", "h", "t"]);
    expect(restarted.aiDrafted).toEqual(["h", "t"]);
  });

  it("fills one empty text block's words, marked, and empties it again", () => {
    const empty: CampaignContent = { v: 1, blocks: [{ id: "x", type: "text", paragraphs: [] }], fallbacks: {} };
    const words = [{ kind: "p" as const, runs: [{ text: "Cool nights." }] }];
    const filled = withDraftText(empty, "x", words);
    expect(filled).toEqual({ v: 1, blocks: [{ id: "x", type: "text", paragraphs: words }], fallbacks: {}, aiDrafted: ["x"] });
    expect(withDraftText(filled, "x", null)).toEqual(empty);
  });

  it("Keep unmarks them all, or the ones named", () => {
    expect(keepAiDrafted(content, ["h"]).aiDrafted).toEqual(["t"]);
    expect(keepAiDrafted(content)).not.toHaveProperty("aiDrafted");
    expect(aiDraftedBlocks(keepAiDrafted(content))).toEqual([]);
  });
});
