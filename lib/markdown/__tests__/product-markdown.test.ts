import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { fixEmphasisFlanking } from "../emphasis";
import { listInWords, markdownReadable, roundTripMarkdown, tidyMarkdown, unsupportedMarkdown } from "../product-markdown";

/**
 * A product body is Markdown the shop renders with `ReactMarkdown`; the
 * product editor edits it visually. What it can show it keeps exactly, what
 * it can't it never drops (the body opens as Markdown instead), and bold
 * written the way Chinese is usually written renders on the shop.
 */

/** What the product page renders, as HTML. */
const shop = (md: string) => renderToStaticMarkup(createElement(ReactMarkdown, null, md)).replace(/\n/g, "");

const BODY = [
  "The Slope Mattress sits under your pillow.",
  "",
  "## Why a slope",
  "",
  "A small incline, with **bold** and *italic* and [a link](https://example.com/care).",
  "",
  "### Care",
  "",
  "- One",
  "- Two",
  "",
  "1. First",
  "2. Second",
  "",
  "> A quote",
  "",
  "A line  ",
  "break",
].join("\n");

describe("what the visual editor can show", () => {
  it("is all of a body written in headings, paragraphs, emphasis, links, lists and quotes", () => {
    expect(unsupportedMarkdown(BODY)).toEqual([]);
    expect(unsupportedMarkdown("")).toEqual([]);
  });

  it("names everything else, once each, so the body opens as Markdown and nothing is dropped", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n\n![a photo](x.png)\n\n`code` and ~~gone~~\n\n```\nblock\n```\n\n---\n\n<b>html</b>\n\n- [ ] a task";
    expect(unsupportedMarkdown(md)).toEqual(["a table", "an image", "code", "struck-through words", "a divider line", "HTML", "a checklist"]);
    expect(listInWords(["a table", "an image", "code"])).toBe("a table, an image and code");
    expect(listInWords(["a table"])).toBe("a table");
  });

  it("goes in and comes out as the same Markdown", () => {
    expect(roundTripMarkdown(BODY)).toBe(BODY);
  });

  it("comes out as it was typed: an ampersand stays one, and an empty body is empty", () => {
    expect(roundTripMarkdown("Care & washing")).toBe("Care & washing");
    expect(tidyMarkdown("A &amp; B, &amp;copy; kept")).toBe("A & B, &amp;copy; kept");
    expect(roundTripMarkdown("")).toBe("");
  });

  it("writes other spellings of the same thing in one way, which renders the same", () => {
    const md = "* one\n* two\n\n__bold__";
    expect(roundTripMarkdown(md)).toBe("- one\n- two\n\n**bold**");
    expect(shop(roundTripMarkdown(md))).toBe(shop(md));
  });
});

describe("bold and italic in Chinese", () => {
  it("renders on the shop: a mark at the run's end moves outside it", () => {
    expect(shop("- **双层泡沫：**底层较硬")).toContain("**双层泡沫：**");
    const fixed = fixEmphasisFlanking("- **双层泡沫：**底层较硬");
    expect(fixed).toBe("- **双层泡沫**：底层较硬");
    expect(shop(fixed)).toBe("<ul><li><strong>双层泡沫</strong>：底层较硬</li></ul>");
    expect(fixEmphasisFlanking("这是*斜体：*文字")).toBe("这是*斜体*：文字");
    expect(fixEmphasisFlanking("看**「引号」**吧")).toBe("看「**引号**」吧");
  });

  it("leaves what already renders alone", () => {
    for (const md of ["**Two layers:** firm", "- **双层泡沫**：底层", "A *quick* test, **bold.** Next", "2 * 3 * 4", "* a bullet *with* italic"]) {
      expect(fixEmphasisFlanking(md)).toBe(md);
    }
  });

  it("is what the editor saves, so bold made in the editor renders on the shop", () => {
    expect(roundTripMarkdown("- **双层泡沫：**底层较硬")).toBe("- **双层泡沫**：底层较硬");
  });
});

describe("markdownReadable", () => {
  it("is the words as a reader sees them: no markers, a link's words and its address", () => {
    expect(markdownReadable("## Why it **fits**\n\n1. First *thing*\n- [care](https://a.com)\n> quoted")).toBe(
      "Why it fits\n\nFirst thing\ncare (https://a.com)\nquoted",
    );
  });
});
