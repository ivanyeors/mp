// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { docFromValue, richTextWords, valueFromDoc, type DocNode, type RichTextValue } from "../rich-text-doc";
import { richTextExtensions, type RichTextMarks } from "../rich-text-schema";

/**
 * TipTap → runs (PRD-campaign-email-editor slice 04): the input's value maps
 * to TipTap's document and back unchanged, and whatever is pasted keeps only
 * what the page allows. The paste goes through ProseMirror's own clipboard
 * parsing, as a browser's paste does.
 */

// jsdom has no ClipboardEvent; ProseMirror's paste makes one to hand its handlers.
globalThis.ClipboardEvent ??= class extends Event {
  clipboardData = null;
} as unknown as typeof ClipboardEvent;

const VARIABLES = [{ key: "first_name", label: "First name", description: "The customer's first name." }];
const https = (url: string) => url.startsWith("https://") && !/\s/.test(url);
const ALL: RichTextMarks = { bold: true, italic: true, bullets: true, link: https };

const editors: Editor[] = [];
function editor(value: RichTextValue = [], marks: RichTextMarks = ALL, opts: { singleLine?: boolean } = {}) {
  const e = new Editor({ extensions: richTextExtensions({ marks, variables: VARIABLES, singleLine: opts.singleLine }), content: docFromValue(value) });
  editors.push(e);
  return e;
}
const read = (e: Editor) => valueFromDoc(e.getJSON() as DocNode, VARIABLES);

afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

const SAMPLE: RichTextValue = [
  {
    kind: "p",
    runs: [
      { text: "Hi " },
      { var: "first_name" },
      { text: ", our " },
      { text: "FibreCool", bold: true },
      { text: " covers are " },
      { text: "back", bold: true, italic: true },
      { text: ".\nRead " },
      { text: "the care guide", href: "https://custom.mpillow.com/en-US/faq" },
      { text: "." },
    ],
  },
  { kind: "bullets", items: [[{ text: "Every size" }], [{ text: "Two ", italic: true }, { text: "colours" }]] },
  { kind: "p", runs: [{ text: "See you soon." }] },
];

describe("the value and TipTap's document", () => {
  it("round-trips through the editor unchanged", () => {
    expect(read(editor(SAMPLE))).toEqual(SAMPLE);
  });

  it("reads an empty input as no paragraphs, and writes one as an empty paragraph", () => {
    expect(read(editor([]))).toEqual([]);
    expect(docFromValue([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("drops empty paragraphs and merges runs with the same marks", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }, { type: "text", text: "c", marks: [{ type: "bold" }] }] },
        { type: "paragraph", content: [] },
      ],
    };
    expect(valueFromDoc(doc, VARIABLES)).toEqual([{ kind: "p", runs: [{ text: "ab" }, { text: "c", bold: true }] }]);
  });

  it("reads a Variable the input does not offer as its {name}, in words", () => {
    const doc: DocNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dear " }, { type: "variable", attrs: { key: "last_name" } }] }] };
    expect(valueFromDoc(doc, VARIABLES)).toEqual([{ kind: "p", runs: [{ text: "Dear {last_name}" }] }]);
    expect(richTextWords(SAMPLE)).toContain("Hi {first_name}, our FibreCool");
  });
});

describe("pasting", () => {
  const fixture = readFileSync(join(__dirname, "fixtures/web-paste.html"), "utf8");

  it("keeps a web page's words, bold, italic, https links, bullets and offered Variables, and nothing else", () => {
    const e = editor();
    e.view.pasteHTML(fixture);
    const value = read(e);
    expect(value).toEqual([
      { kind: "p", runs: [{ text: "Sleep cooler this December" }] },
      {
        kind: "p",
        runs: [
          { text: "Hi " },
          { var: "first_name" },
          { text: ", our " },
          { text: "FibreCool", bold: true },
          { text: " covers are " },
          { text: "back", italic: true },
          { text: ", and underlined and struck words stay words." },
        ],
      },
      {
        kind: "p",
        runs: [
          { text: "Read " },
          { text: "the care guide", href: "https://custom.mpillow.com/en-US/faq" },
          { text: ", not an http page or a script." },
        ],
      },
      // A table's cells, as words: there is no table to keep.
      { kind: "p", runs: [{ text: "A table cellsome code" }] },
      {
        kind: "bullets",
        items: [[{ text: "First, numbered" }], [{ text: "Second, numbered" }], [{ text: "Nested inside" }], [{ text: "Bold", bold: true }, { text: " item" }]],
      },
      { kind: "p", runs: [{ text: "Dear {last_name},\none line, then another." }] },
    ]);
    const html = e.getHTML();
    for (const gone of ["<h1", "<img", "<table", "<code", "<script", "style=", "color", "onclick", "javascript:", "http://", "<u>", "<s>", "<ol"]) {
      expect(html, gone).not.toContain(gone);
    }
  });

  it("keeps only words when the page allows no marks", () => {
    const e = editor([], {});
    e.view.pasteHTML(fixture);
    const value = read(e);
    const runs = value.flatMap((p) => (p.kind === "p" ? p.runs : p.items.flat()));
    expect(value.every((p) => p.kind === "p")).toBe(true);
    expect(runs.every((r) => "var" in r || (!r.bold && !r.italic && !r.href))).toBe(true);
    expect(richTextWords(value)).toContain("the care guide");
  });

  it("joins pasted lines into one in a single-line input", () => {
    const e = editor([], {}, { singleLine: true });
    e.view.pasteText("Sleep cooler\nthis December, {first_name}");
    expect(read(e)).toEqual([{ kind: "p", runs: [{ text: "Sleep cooler this December, " }, { var: "first_name" }] }]);
  });
});
