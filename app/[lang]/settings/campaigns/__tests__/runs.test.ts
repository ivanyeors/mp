import { describe, expect, it } from "vitest";
import { richTextFromWords, richTextWords, type RichTextValue } from "@/components/block-editor/rich-text-doc";
import { CampaignContentSchema, type Paragraph } from "@/lib/email-campaigns/content";
import { campaignVariables, paragraphsOf, richTextOf, TEXT_VARIABLES } from "../blocks/runs";
import { inboxCut, senderName } from "../email-preview";

/**
 * A text block's words between the shared `RichText` and the campaign's
 * content (PRD-campaign-email-editor slice 04): the same runs, with only what
 * the content can hold kept.
 */

const PARAGRAPHS: Paragraph[] = [
  {
    kind: "p",
    runs: [
      { text: "Hi " },
      { var: "first_name" },
      { text: ", our " },
      { text: "FibreCool", bold: true },
      { text: " covers are " },
      { text: "back", italic: true },
      { text: ".\nRead " },
      { text: "the care guide", href: "https://custom.mpillow.com/en-US/faq" },
    ],
  },
  { kind: "bullets", items: [[{ text: "Every size" }], [{ text: "Two colours", bold: true }]] },
];

describe("the text block's runs", () => {
  it("round-trip through the input's value unchanged, and pass the save schema", () => {
    expect(paragraphsOf(richTextOf(PARAGRAPHS))).toEqual(PARAGRAPHS);
    const content = { v: 1, blocks: [{ id: "t", type: "text", paragraphs: paragraphsOf(richTextOf(PARAGRAPHS)) }], fallbacks: {} };
    expect(CampaignContentSchema.safeParse(content).success).toBe(true);
  });

  it("keep only what the content holds: an https link, a known Variable, no empty run or paragraph", () => {
    const value: RichTextValue = [
      { kind: "p", runs: [{ text: "" }, { text: "Go ", href: "http://example.com" }, { text: "here", href: "javascript:alert(1)" }, { var: "nickname" }] },
      { kind: "p", runs: [] },
      { kind: "bullets", items: [[], [{ text: "kept" }]] },
    ];
    expect(paragraphsOf(value)).toEqual([
      { kind: "p", runs: [{ text: "Go here{nickname}" }] },
      { kind: "bullets", items: [[{ text: "kept" }]] },
    ]);
  });

  it("offer the catalogue's Variables, by label, Points balance greyed while points are not live (slice 13)", () => {
    expect(TEXT_VARIABLES).toEqual([
      { key: "first_name", label: "First name", description: "The customer's first name.", disabledReason: null },
      { key: "last_name", label: "Last name", description: "The customer's last name.", disabledReason: null },
      { key: "points_balance", label: "Points balance", description: "The points the customer has to spend, as 1,250.", disabledReason: null },
    ]);
    expect(campaignVariables({ pointsLive: false }).map((v) => [v.key, v.disabledReason])).toEqual([
      ["first_name", null],
      ["last_name", null],
      ["points_balance", "Points aren't live yet"],
    ]);
  });
});

describe("words with their Variables written {name} (a heading, the subject, the preview line)", () => {
  it("load as chips for the Variables offered and save back as they were", () => {
    const lines = ["{first_name}, sleep cooler this December", "You have {points_balance} points, {last_name}", "{nickname} and {50% off}", "Plain words", ""];
    for (const line of lines) expect(richTextWords(richTextFromWords(line, TEXT_VARIABLES))).toBe(line);
    expect(richTextFromWords("{first_name}, sleep {nickname}", TEXT_VARIABLES)).toEqual([
      { kind: "p", runs: [{ var: "first_name" }, { text: ", sleep {nickname}" }] },
    ]);
    // An input that offers no Variables (a campaign written before blocks) keeps every {name} as words.
    expect(richTextFromWords("{first_name}", [])).toEqual([{ kind: "p", runs: [{ text: "{first_name}" }] }]);
  });
});

describe("the inbox row", () => {
  it("cuts where Gmail on a phone does, with an ellipsis", () => {
    expect(inboxCut("Sleep cooler this December", 35)).toBe("Sleep cooler this December");
    expect(inboxCut("Mei Ling, sleep cooler this December with FibreCool", 35)).toBe("Mei Ling, sleep cooler this Decemb…");
    expect(inboxCut("  spaces   collapse  ", 35)).toBe("spaces collapse");
  });

  it("names the sender as an inbox does", () => {
    expect(senderName("Mpillow <hello@hello.mpillow.com>")).toBe("Mpillow");
    expect(senderName('"Mpillow Care" <care@mpillow.com>')).toBe("Mpillow Care");
    expect(senderName("hello@mpillow.com")).toBe("hello@mpillow.com");
    expect(senderName(null)).toBeNull();
  });
});
