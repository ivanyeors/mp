import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { REFINE_NEEDS_SUBJECT, REFINE_NEEDS_WORDS, ideasBlocker } from "@/lib/email-campaigns/ai-refine-brief";
import {
  REWRITE_NEEDS_WORDS,
  RefineRequestSchema,
  blockLinks,
  blockVariables,
  refineOutputSchema,
  rewriteBlocker,
  rewriteFromAnswer,
  rewriteSource,
} from "@/lib/email-campaigns/ai-refine-shape";
import { FITTING_URL, LINKED_TEXT, PREVIEW_LINES, REWRITE, SHORTER_TEXT, SUBJECTS, TITLE } from "./ai-refine-fixtures";

/**
 * ✨ Refine's shapes (PRD-campaign-email-editor slice 10): what the editor
 * may ask, the small schema Claude fills, and a rewrite back as its block,
 * every link put back by its key and checked by the schema a save uses.
 */

describe("RefineRequestSchema", () => {
  it("takes subject and preview line asks, and a rewrite of a heading or a text block", () => {
    for (const r of [SUBJECTS, PREVIEW_LINES, REWRITE, { ...REWRITE, block: TITLE }]) expect(RefineRequestSchema.safeParse(r).success).toBe(true);
  });

  it("refuses a rewrite of any other block, and Something else without words or over 120 characters", () => {
    const button = { id: "b", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] };
    expect(RefineRequestSchema.safeParse({ ...REWRITE, block: button }).error?.issues[0]?.message).toBe("Only a heading or a text block can be rewritten.");
    expect(RefineRequestSchema.safeParse({ ...REWRITE, action: "other", instruction: "  " }).error?.issues[0]?.message).toBe("Say how Claude should change it.");
    expect(RefineRequestSchema.safeParse({ ...REWRITE, action: "other", instruction: "x".repeat(121) }).error?.issues[0]?.message).toBe("At most 120 characters.");
    expect(RefineRequestSchema.safeParse({ ...REWRITE, action: "other", instruction: "Mention that it's washable" }).success).toBe(true);
  });

  it("is strict: nothing it doesn't name, such as a customer", () => {
    expect(RefineRequestSchema.safeParse({ ...SUBJECTS, customer: { email: "a@b.co" } }).success).toBe(false);
  });
});

describe("the blockers", () => {
  it("needs words to suggest subject lines from, and a subject for a preview line to follow", () => {
    expect(ideasBlocker("subjects", { subject: "", words: [] })).toBe(REFINE_NEEDS_WORDS);
    expect(ideasBlocker("subjects", { subject: "", words: ["Warm nights are back"] })).toBeNull();
    expect(ideasBlocker("subjects", { subject: "Sleep cooler this December", words: [] })).toBeNull();
    expect(ideasBlocker("preview_lines", { subject: "", words: ["Warm nights are back"] })).toBe(REFINE_NEEDS_SUBJECT);
    expect(ideasBlocker("preview_lines", { subject: "Sleep cooler", words: [] })).toBeNull();
  });

  it("needs words in a block to rewrite it, a Variable alone being none", () => {
    expect(rewriteBlocker({ id: "h", type: "heading", level: 2, text: " " })).toBe(REWRITE_NEEDS_WORDS);
    expect(rewriteBlocker({ id: "h", type: "heading", level: 2, text: "{first_name}" })).toBe(REWRITE_NEEDS_WORDS);
    expect(rewriteBlocker({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ var: "first_name" }] }] })).toBe(REWRITE_NEEDS_WORDS);
    expect(rewriteBlocker(LINKED_TEXT)).toBeNull();
    expect(rewriteBlocker(TITLE)).toBeNull();
  });
});

describe("a rewrite's links and Variables", () => {
  it("names each link by a key, never its address, and lists the Variables", () => {
    expect(blockLinks(LINKED_TEXT)).toEqual([FITTING_URL]);
    expect(blockVariables(LINKED_TEXT)).toEqual(["first_name"]);
    expect(blockVariables(TITLE)).toEqual(["first_name"]);
    expect(JSON.stringify(rewriteSource(LINKED_TEXT))).not.toContain("https://");
    expect(rewriteSource(LINKED_TEXT)).toMatchObject({ paragraphs: [{}, { runs: [{}, { text: "Book a fitting", bold: true, link: "L1" }, {}] }] });
  });

  it("builds a schema Claude can fill: its links and Variables only, as enums the parse holds", () => {
    const { schema } = betaZodOutputFormat(refineOutputSchema(REWRITE));
    expect(JSON.stringify(schema)).toContain("L1");
    expect(JSON.stringify(schema)).not.toContain(FITTING_URL);
    expect(betaZodOutputFormat(refineOutputSchema({ ...REWRITE, block: TITLE })).schema).toMatchObject({ properties: { text: { type: "string" } } });
    expect(betaZodOutputFormat(refineOutputSchema(SUBJECTS)).schema).toMatchObject({ properties: { subjects: { type: "array" } } });
  });

  it("puts each link back by its key, and a {first_name} written as words back as the Variable", () => {
    const made = rewriteFromAnswer(LINKED_TEXT, SHORTER_TEXT);
    expect(made).toMatchObject({ ok: true, block: { id: "t1", paragraphs: [{}, { runs: [{ text: "Book a fitting", href: FITTING_URL }, {}] }] } });
    const written = rewriteFromAnswer(LINKED_TEXT, { paragraphs: [{ kind: "p", runs: [{ text: "Hi {first_name}, cooler nights. " }, { text: "Book", link: "L1" }] }] });
    expect(written).toMatchObject({ ok: true, block: { paragraphs: [{ runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", cooler nights. " }, { text: "Book", href: FITTING_URL }] }] } });
  });

  it("refuses a key the original doesn't have, an address, or anything else the answer's schema doesn't name", () => {
    expect(rewriteFromAnswer(LINKED_TEXT, { paragraphs: [{ kind: "p", runs: [{ text: "Book", link: "L2" }] }] }).ok).toBe(false);
    expect(rewriteFromAnswer(LINKED_TEXT, { paragraphs: [{ kind: "p", runs: [{ text: "Book", href: "https://evil.example" }] }] }).ok).toBe(false);
    expect(rewriteFromAnswer(LINKED_TEXT, { paragraphs: [{ kind: "p", runs: [{ var: "points_balance" }] }] }).ok).toBe(false);
    expect(rewriteFromAnswer(TITLE, { text: "x", level: 2 }).ok).toBe(false);
  });

  it("keeps a heading one line and its level, and holds the save schema's lengths", () => {
    expect(rewriteFromAnswer(TITLE, { text: "{first_name},\n sleep  cooler" })).toEqual({ ok: true, block: { id: "h1", type: "heading", level: 1, text: "{first_name}, sleep cooler" } });
    expect(rewriteFromAnswer(TITLE, { text: "x".repeat(121) })).toEqual({ ok: false, problem: "text: At most 120 characters." });
    expect(rewriteFromAnswer(TITLE, { text: "Hi {frist_name}" }).ok).toBe(false);
  });

  it("drops empty runs and paragraphs, and refuses a rewrite with no words", () => {
    expect(rewriteFromAnswer(LINKED_TEXT, { paragraphs: [{ kind: "p", runs: [{ text: "" }] }, { kind: "p", runs: [{ text: "Cool. " }, { text: "Book", link: "L1" }] }] })).toMatchObject({
      ok: true,
      block: { paragraphs: [{ kind: "p", runs: [{ text: "Cool. " }, { text: "Book", href: FITTING_URL }] }] },
    });
    expect(rewriteFromAnswer(LINKED_TEXT, { paragraphs: [] })).toEqual({ ok: false, problem: "paragraphs: Write the text." });
  });
});
