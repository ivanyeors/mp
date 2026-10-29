/**
 * `RichText`'s TipTap schema (PRD-campaign-email-editor slice 04): the
 * nodes and marks a page allows, and nothing else, so whatever is typed or
 * pasted (from Word, a web page, another email) keeps only words, the allowed
 * marks, https links, bullets and the Variables the page offers. Loaded only
 * with the input itself (rich-text-editor.tsx), never on a page's first load.
 */
import { Extension, Node, escapeForRegEx, mergeAttributes, nodeInputRule, nodePasteRule, type Extensions } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Placeholder } from "@tiptap/extensions";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { RICH_TEXT_NODES, type RichTextVariable } from "./rich-text-doc";
import { VARIABLE_CHIP } from "./rich-text-style";

/** Which marks the input allows. None is plain words, as an Email template's fields are. */
export interface RichTextMarks {
  bold?: boolean;
  italic?: boolean;
  bullets?: boolean;
  /** Links, and which ones it keeps: the page's own rule (an Email campaign's is https only). */
  link?: (url: string) => boolean;
}

export interface RichTextSchemaOptions {
  marks: RichTextMarks;
  variables: readonly RichTextVariable[];
  placeholder?: string;
  /** One line: no paragraphs, no line breaks, no lists. */
  singleLine?: boolean;
}

/** A Variable in the words: an atom showing its label, written `{key}` as text. */
const VariableNode = Node.create<{ variables: readonly RichTextVariable[] }>({
  name: RICH_TEXT_NODES.variable,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addOptions() {
    return { variables: [] };
  },

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-variable"),
        renderHTML: (attrs) => ({ "data-variable": attrs.key }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const v = this.options.variables.find((x) => x.key === node.attrs.key);
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: VARIABLE_CHIP, contenteditable: "false", ...(v?.description ? { title: v.description } : {}) }),
      v?.label ?? `{${node.attrs.key}}`,
    ];
  },

  renderText({ node }) {
    return `{${node.attrs.key}}`;
  },

  // `{first_name}` typed or pasted becomes the chip, for each Variable offered. The
  // whole match is replaced, so the pattern has no capture group: the key is read off it.
  addInputRules() {
    const keys = this.options.variables.map((v) => escapeForRegEx(v.key));
    if (!keys.length) return [];
    return [nodeInputRule({ find: new RegExp(`\\{(?:${keys.join("|")})\\}$`), type: this.type, getAttributes: (m) => ({ key: m[0].slice(1, -1) }) })];
  },

  addPasteRules() {
    const keys = this.options.variables.map((v) => escapeForRegEx(v.key));
    if (!keys.length) return [];
    return [nodePasteRule({ find: new RegExp(`\\{(?:${keys.join("|")})\\}`, "g"), type: this.type, getAttributes: (m) => ({ key: m[0].slice(1, -1) }) })];
  },
});

/** One line: Enter adds nothing (the page's form may submit), and pasted lines join with a space. */
const OneLine = Extension.create({
  name: "oneLine",
  addKeyboardShortcuts() {
    return { Enter: () => true, "Shift-Enter": () => true };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("oneLine"),
        props: { transformPastedText: (text) => text.replace(/\s*[\r\n]+\s*/g, " ") },
      }),
    ];
  },
});

/** Pure — the extensions for one input: only what its page allows. */
export function richTextExtensions({ marks, variables, placeholder, singleLine }: RichTextSchemaOptions): Extensions {
  const lists = marks.bullets && !singleLine;
  const out: Extensions = [
    singleLine ? Document.extend({ content: "paragraph" }) : Document,
    Paragraph,
    Text,
    VariableNode.configure({ variables }),
  ];
  if (!singleLine) out.push(HardBreak.configure({ keepMarks: true }));
  if (marks.bold) out.push(Bold);
  if (marks.italic) out.push(Italic);
  const allowed = marks.link;
  if (allowed) {
    out.push(
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => allowed(url),
        shouldAutoLink: (url) => allowed(url),
        HTMLAttributes: { class: "underline underline-offset-2", rel: null, target: null },
      }),
    );
  }
  // A list item is one paragraph: a list inside a list has nowhere to go, so a pasted one flattens.
  if (lists) out.push(BulletList, ListItem.extend({ content: "paragraph" }));
  if (placeholder) out.push(Placeholder.configure({ placeholder, showOnlyWhenEditable: true }));
  if (singleLine) out.push(OneLine);
  return out;
}
