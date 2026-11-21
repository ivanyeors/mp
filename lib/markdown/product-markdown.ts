import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { MarkdownManager } from "@tiptap/markdown";
import { fixEmphasisFlanking } from "./emphasis";

export { fixEmphasisFlanking } from "./emphasis";

export const BODY_HEADING_LEVELS = [2, 3] as const;

export function productMarkdownExtensions() {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    HardBreak,
    Heading.configure({ levels: [1, 2, 3, 4] }),
    Blockquote,
    BulletList,
    OrderedList,
    ListItem,
    Link.configure({ openOnClick: false, autolink: false, linkOnPaste: true, HTMLAttributes: { rel: null, target: null } }),
  ];
}

let manager: MarkdownManager | null = null;
const markdown = () => (manager ??= new MarkdownManager({ extensions: productMarkdownExtensions() }));

const UNSUPPORTED: Record<string, string> = {
  table: "a table",
  image: "an image",
  code: "code",
  codespan: "code",
  hr: "a divider line",
  html: "HTML",
  del: "struck-through words",
  def: "a link reference",
  task: "a checklist",
  checkbox: "a checklist",
};

const SUPPORTED = new Set(["space", "paragraph", "heading", "text", "strong", "em", "link", "br", "escape", "list", "list_item", "blockquote"]);

interface Token {
  type: string;
  task?: boolean;
  tokens?: Token[];
  items?: Token[];
}

export function unsupportedMarkdown(md: string): string[] {
  if (!md.trim()) return [];
  const found = new Set<string>();
  const walk = (tokens: readonly Token[] | undefined) => {
    for (const t of tokens ?? []) {
      if (t.type === "list_item" && t.task) found.add(UNSUPPORTED.task);
      else if (!SUPPORTED.has(t.type)) found.add(UNSUPPORTED[t.type] ?? `formatting the editor doesn't know (${t.type})`);
      walk(t.tokens);
      walk(t.items);
    }
  };
  walk(markdown().instance.lexer(md) as unknown as Token[]);
  return [...found];
}

export function listInWords(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function tidyMarkdown(md: string): string {
  const out = md.replace(/&amp;(?!(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);)/gi, "&").replace(/^(?:\s|&nbsp;| )+$/, "");
  return fixEmphasisFlanking(out.replace(/\s+$/, ""));
}

export function roundTripMarkdown(md: string): string {
  return tidyMarkdown(markdown().serialize(markdown().parse(fixEmphasisFlanking(md))));
}

export function markdownReadable(md: string): string {
  return md
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/!?\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, "$1 ($2)")
        .replace(/(\*\*|__)(.+?)\1/g, "$2")
        .replace(/(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*])/g, "$2")
        .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1")
        .replace(/ {2,}$/, ""),
    )
    .join("\n")
    .trim();
}
