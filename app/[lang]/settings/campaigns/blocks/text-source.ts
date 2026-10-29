/**
 * A text block as Staff type it in the campaign editor's plain box
 * (PRD-campaign-email-editor slice 03), read into the content's paragraphs
 * and runs, and written back. Pure. Slice 04 replaces the box with the shared
 * `RichText` input; until then this is how bold, a link and a Variable get in:
 *
 *   a blank line           starts a new paragraph (one line end is a line break)
 *   a line "- item"        is a bullet (a run of them is one list)
 *   **words**              bold;   _words_  italic
 *   [words](https://…)     a link that reads as its words
 *   https://…              a link that reads as `mpillow.com/…`, as before
 *   {first_name}           the customer's first name, a Variable
 *   \* \_ \[ \{ \\         the character itself
 *
 * Reading what it wrote gives the same paragraphs back
 * (`parseTextSource(textSourceOf(p))` equals `p` for paragraphs it read).
 */
import { linkLabel, URL_IN_TEXT } from "@/lib/email/campaign-body";
import type { Paragraph, Run, TextRun } from "@/lib/email-campaigns/content";
import { isVariableKey } from "@/lib/email-campaigns/variables";

type Marks = { bold?: boolean; italic?: boolean; href?: string };

const BULLET = /^[-*•](?:\s+(.*))?$/;
const ESCAPABLE = new Set(["\\", "*", "_", "[", "]", "{", "}", "-", "•"]);
const LINK = /^\[((?:\\.|[^\]\\])+)\]\((https:\/\/[^\s)]+)\)/;
const VARIABLE = /^\{([a-z][a-z0-9_]*)\}/;
const URL_AT_START = new RegExp(`^(?:${URL_IN_TEXT.source})`);

/** Runs with the same marks side by side become one. */
function pushRun(out: Run[], r: Run) {
  const last = out.at(-1);
  if (last && "text" in last && "text" in r && last.bold === r.bold && last.italic === r.italic && last.href === r.href) {
    last.text += r.text;
  } else out.push(r);
}

const textRun = (text: string, m: Marks): TextRun => ({
  text,
  ...(m.bold ? { bold: true } : {}),
  ...(m.italic ? { italic: true } : {}),
  ...(m.href ? { href: m.href } : {}),
});

/** The index of the next unescaped `close` at or after `from` that ends words (no space before it), or -1. */
function closing(s: string, close: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s.startsWith(close, i) && !/\s/.test(s[i - 1])) return i;
  }
  return -1;
}

function parseSpan(s: string, m: Marks, out: Run[]) {
  let text = "";
  const flush = () => {
    if (text) pushRun(out, textRun(text, m));
    text = "";
  };
  for (let i = 0; i < s.length; ) {
    const rest = s.slice(i);
    if (s[i] === "\\" && ESCAPABLE.has(s[i + 1] ?? "")) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    const variable = VARIABLE.exec(rest);
    if (variable) {
      // A `{name}` that is not a Variable stays words, whole.
      if (isVariableKey(variable[1])) {
        flush();
        out.push({ var: variable[1] });
      } else text += variable[0];
      i += variable[0].length;
      continue;
    }
    const link = m.href ? null : LINK.exec(rest);
    if (link) {
      flush();
      parseSpan(link[1], { ...m, href: link[2] }, out);
      i += link[0].length;
      continue;
    }
    // A mark opens on words, as Markdown's do: `2 ** 3` is words.
    if (rest.startsWith("**") && !/\s/.test(s[i + 2] ?? " ") && !m.bold) {
      const end = closing(s, "**", i + 2);
      if (end > i + 2) {
        flush();
        parseSpan(s.slice(i + 2, end), { ...m, bold: true }, out);
        i = end + 2;
        continue;
      }
    }
    // An underscore inside a word (my_file_name) is words.
    if (s[i] === "_" && !/\s/.test(s[i + 1] ?? " ") && !/[\p{L}\p{N}]/u.test(s[i - 1] ?? "") && !m.italic) {
      const end = closing(s, "_", i + 1);
      if (end > i + 1) {
        flush();
        parseSpan(s.slice(i + 1, end), { ...m, italic: true }, out);
        i = end + 1;
        continue;
      }
    }
    const url = m.href ? null : URL_AT_START.exec(rest);
    if (url) {
      flush();
      pushRun(out, textRun(linkLabel(url[0]), { ...m, href: url[0] }));
      i += url[0].length;
      continue;
    }
    text += s[i];
    i++;
  }
  flush();
}

/** Pure — one line or paragraph of the box as runs. */
export function parseRuns(s: string): Run[] {
  const out: Run[] = [];
  parseSpan(s, {}, out);
  return out;
}

/** Pure — the box's words as a text block's paragraphs. Empty lines and empty items are dropped. */
export function parseTextSource(source: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let lines: string[] = [];
  let items: string[] = [];
  const close = () => {
    const runs = lines.length ? parseRuns(lines.join("\n")) : [];
    if (runs.length) paragraphs.push({ kind: "p", runs });
    const list = items.map(parseRuns).filter((r) => r.length);
    if (list.length) paragraphs.push({ kind: "bullets", items: list });
    lines = [];
    items = [];
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (lines.length) close();
      const item = (bullet[1] ?? "").trim();
      if (item) items.push(item);
    } else {
      if (items.length) close();
      lines.push(line);
    }
  }
  close();
  return paragraphs;
}

const escapeWords = (t: string) => t.replace(/[\\*_[\]{}]/g, (c) => `\\${c}`);

/** One run's words, with their marks outside its edge spaces, so `_ b_` never has to read as italic. */
function runSource(r: Run): string {
  if ("var" in r) return `{${r.var}}`;
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(escapeWords(r.text))!;
  if (!core) return lead + trail;
  let t = core;
  if (r.italic) t = `_${t}_`;
  if (r.bold) t = `**${t}**`;
  return lead + t + trail;
}

/** Pure — runs as the box writes them: links grouped, a link that reads as its address written bare. */
export function runsSource(runs: readonly Run[]): string {
  let out = "";
  for (let i = 0; i < runs.length; ) {
    const r = runs[i];
    const href = "href" in r ? r.href : undefined;
    if (!href) {
      out += runSource(r);
      i++;
      continue;
    }
    const group: TextRun[] = [];
    while (i < runs.length && (runs[i] as TextRun).href === href) group.push(runs[i++] as TextRun);
    const [only] = group;
    out +=
      group.length === 1 && !only.bold && !only.italic && only.text === linkLabel(href)
        ? href
        : `[${group.map((g) => runSource({ ...g, href: undefined })).join("")}](${href})`;
  }
  // A line that would start a bullet starts with its character instead.
  return out.replace(/(^|\n)(\s*)([-•])/g, "$1$2\\$3");
}

/** Pure — a text block's paragraphs as the box writes them. */
export function textSourceOf(paragraphs: readonly Paragraph[]): string {
  return paragraphs
    .map((p) => (p.kind === "p" ? runsSource(p.runs) : p.items.map((item) => `- ${runsSource(item)}`).join("\n")))
    .join("\n\n");
}
