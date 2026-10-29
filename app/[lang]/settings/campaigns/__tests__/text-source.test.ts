import { describe, expect, it } from "vitest";
import { CampaignContentSchema, contentFromLegacy, type Paragraph } from "@/lib/email-campaigns/content";
import { FIRST_CAMPAIGN_DRAFT } from "@/lib/email-campaigns/rules";
import { parseRuns, parseTextSource, textSourceOf } from "../blocks/text-source";

/**
 * The text block's plain box (PRD-campaign-email-editor slice 03): what Staff
 * type becomes paragraphs and runs, with bold, italic, links and the first
 * name, and the box shows a block's runs back as they were.
 */

describe("parseTextSource", () => {
  it("reads paragraphs, line breaks and bullets as the message box did", () => {
    expect(parseTextSource("First line\nsame paragraph\n\n- one\n* two\n\n\nLast")).toEqual([
      { kind: "p", runs: [{ text: "First line\nsame paragraph" }] },
      { kind: "bullets", items: [[{ text: "one" }], [{ text: "two" }]] },
      { kind: "p", runs: [{ text: "Last" }] },
    ]);
    expect(parseTextSource("Intro\n- a\n- b\nAfter")).toEqual([
      { kind: "p", runs: [{ text: "Intro" }] },
      { kind: "bullets", items: [[{ text: "a" }], [{ text: "b" }]] },
      { kind: "p", runs: [{ text: "After" }] },
    ]);
    expect(parseTextSource("  \n-  \r\n")).toEqual([]);
  });

  it("reads bold, italic, links that read as their words, and the first name", () => {
    expect(parseRuns("Hi {first_name}, our **FibreCool** covers are _back_. Read [the **care** guide](https://mpillow.com/care).")).toEqual([
      { text: "Hi " },
      { var: "first_name" },
      { text: ", our " },
      { text: "FibreCool", bold: true },
      { text: " covers are " },
      { text: "back", italic: true },
      { text: ". Read " },
      { text: "the ", href: "https://mpillow.com/care" },
      { text: "care", bold: true, href: "https://mpillow.com/care" },
      { text: " guide", href: "https://mpillow.com/care" },
      { text: "." },
    ]);
  });

  it("links a bare https address as the message box did, reading as mpillow.com/…", () => {
    expect(parseRuns("See https://www.mpillow.com/faq/.")).toEqual([
      { text: "See " },
      { text: "mpillow.com/faq", href: "https://www.mpillow.com/faq/" },
      { text: "." },
    ]);
  });

  it("leaves half-typed marks, unknown {names}, snake_case and other links as words", () => {
    expect(parseRuns("2 ** 3 and _ x and **open")).toEqual([{ text: "2 ** 3 and _ x and **open" }]);
    expect(parseRuns("{last_name} and my_file_name")).toEqual([{ text: "{last_name} and my_file_name" }]);
    expect(parseRuns("[click](javascript:alert(1)) http://old.example")).toEqual([{ text: "[click](javascript:alert(1)) http://old.example" }]);
    expect(parseRuns("\\*not bold\\* \\{first_name\\} \\_x\\_")).toEqual([{ text: "*not bold* {first_name} _x_" }]);
  });

  it("keeps a tag as words for the schema to refuse", () => {
    const paragraphs = parseTextSource("<script>alert(1)</script>");
    expect(paragraphs).toEqual([{ kind: "p", runs: [{ text: "<script>alert(1)</script>" }] }]);
    const block = { id: "t", type: "text", paragraphs };
    expect(CampaignContentSchema.safeParse({ v: 1, blocks: [block], fallbacks: {} }).success).toBe(false);
  });
});

describe("textSourceOf", () => {
  const roundTrip = (p: Paragraph[]) => parseTextSource(textSourceOf(p));

  it("writes the block back as Staff would type it", () => {
    expect(
      textSourceOf([
        { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", " }, { text: "bold", bold: true }, { text: " and " }, { text: "both", bold: true, italic: true }] },
        { kind: "bullets", items: [[{ text: "one" }], [{ text: "the guide", href: "https://mpillow.com/care" }]] },
        { kind: "p", runs: [{ text: "mpillow.com/faq", href: "https://mpillow.com/faq" }] },
      ]),
    ).toBe("Hi {first_name}, **bold** and **_both_**\n\n- one\n- [the guide](https://mpillow.com/care)\n\nhttps://mpillow.com/faq");
  });

  it("reads back what it wrote, marks side by side and characters that look like marks included", () => {
    const cases: Paragraph[][] = [
      [{ kind: "p", runs: [{ text: "a", italic: true }, { text: "b", bold: true }, { text: "c", bold: true, italic: true }, { text: "d" }] }],
      [{ kind: "p", runs: [{ text: "x " }, { text: "y", bold: true }, { text: " " }, { text: "z", italic: true, href: "https://a.test/b_c" }] }],
      [{ kind: "p", runs: [{ text: "2*3 [a] {first_name} \\ _snake_ - dash\n- not a bullet\n• nor this" }] }],
      [{ kind: "p", runs: [{ text: "- starts like a bullet" }] }],
      [{ kind: "bullets", items: [[{ text: "- dashed item" }], [{ var: "first_name" }, { text: " item" }]] }],
    ];
    for (const p of cases) expect(roundTrip(p), JSON.stringify(p)).toEqual(p);
  });

  it("shows a converted legacy message as the box would read it, so editing it keeps its words", () => {
    const content = contentFromLegacy(FIRST_CAMPAIGN_DRAFT);
    for (const b of content.blocks) {
      if (b.type === "text") expect(roundTrip(b.paragraphs)).toEqual(b.paragraphs);
    }
  });
});
