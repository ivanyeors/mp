// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { docFromValue, richTextFromWords, richTextWords, valueFromDoc, type DocNode, type RichTextValue } from "../rich-text-doc";
import { matchVariables, richTextExtensions, type RichTextMarks } from "../rich-text-schema";

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

describe("words with their Variables written {name} (PRD-campaign-email-editor slice 13)", () => {
  it("load as the input's value, each offered Variable a chip, and save back as they were", () => {
    expect(richTextFromWords("{first_name}, sleep cooler {soon}", VARIABLES)).toEqual([
      { kind: "p", runs: [{ var: "first_name" }, { text: ", sleep cooler {soon}" }] },
    ]);
    expect(richTextFromWords("One\nline\n\nTwo {first_name}", VARIABLES)).toEqual([
      { kind: "p", runs: [{ text: "One\nline" }] },
      { kind: "p", runs: [{ text: "Two " }, { var: "first_name" }] },
    ]);
    expect(richTextFromWords("", VARIABLES)).toEqual([]);
    for (const words of ["{first_name}{first_name}", "Hi {first_name}!", "No names", "One\nline\n\nTwo {first_name}"]) {
      expect(richTextWords(richTextFromWords(words, VARIABLES))).toBe(words);
      expect(richTextWords(read(editor(richTextFromWords(words, VARIABLES))))).toBe(words);
    }
  });

  it("takes a dropped or pasted chip only for a Variable the input offers", () => {
    const e = editor([], {}, { singleLine: true });
    e.view.pasteHTML('<p>Hi <span data-variable="first_name"></span> <span data-variable="password"></span>!</p>');
    expect(read(e)).toEqual([{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: " !" }] }]);
  });

  it("matches what is typed after { by key or by label", () => {
    const all = [...VARIABLES, { key: "last_name", label: "Last name" }, { key: "points_balance", label: "Points balance" }];
    expect(matchVariables(all, "").map((v) => v.key)).toEqual(["first_name", "last_name", "points_balance"]);
    expect(matchVariables(all, "la").map((v) => v.key)).toEqual(["last_name"]);
    expect(matchVariables(all, "name").map((v) => v.key)).toEqual(["first_name", "last_name"]);
    expect(matchVariables(all, "points_b").map((v) => v.key)).toEqual(["points_balance"]);
    expect(matchVariables(all, "zz")).toEqual([]);
  });
});
