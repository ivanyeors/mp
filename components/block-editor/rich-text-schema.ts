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
import type { EditorView } from "@tiptap/pm/view";
import { exitSuggestion, Suggestion, type SuggestionProps } from "@tiptap/suggestion";
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
  /** The `{` menu's handlers: with them, `{` opens the Variables on offer. */
  variableMenu?: VariableMenuHandlers;
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

  // A chip pasted or dropped in (from the Variables palette, or another input)
  // is one only for a Variable this input offers; any other leaves nothing.
  parseHTML() {
    const offered = new Set(this.options.variables.map((v) => v.key));
    return [{ tag: "span[data-variable]", getAttrs: (el) => (offered.has(el.getAttribute("data-variable") ?? "") ? null : false) }];
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

/** The `{` menu as the input shows it: what matches the words typed after the `{`. */
export interface VariableMenuState {
  items: readonly RichTextVariable[];
  /** Puts the chip in place of the `{` and what was typed after it. */
  choose: (v: RichTextVariable) => void;
  /** Where the caret is, to place the menu under it. */
  rect: () => DOMRect | null;
}

/** What the input does with its `{` menu (rich-text-editor.tsx). */
export interface VariableMenuHandlers {
  /** The menu opened, changed, or closed (null). */
  onChange: (menu: VariableMenuState | null) => void;
  /** A key while the menu is open: true when the menu took it. Escape closes the menu by itself. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** The `{` menu's plugin, for closing it from outside (the words losing focus). */
export const VARIABLE_MENU_KEY = new PluginKey("variableMenu");

/** Closes the `{` menu, leaving the words as typed. */
export const closeVariableMenu = (view: EditorView) => exitSuggestion(view, VARIABLE_MENU_KEY);

/** Pure — the Variables whose key, label or a word of its label starts with what was typed after `{`. */
export function matchVariables(variables: readonly RichTextVariable[], query: string): RichTextVariable[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...variables];
  const words = q.replace(/_/g, " ");
  return variables.filter((v) => {
    const label = v.label.toLowerCase();
    return v.key.startsWith(q) || label.startsWith(words) || label.split(/\s+/).some((w) => w.startsWith(words));
  });
}

/**
 * `{` typed anywhere in the words opens the Variables on offer, as a list
 * under the caret: the keyboard's way to put one in (PRD-campaign-email-editor
 * slice 13). The `{` stays typed, so `{first_name}` written out by hand still
 * becomes its chip; choosing from the list replaces what was typed.
 */
const VariableMenu = Extension.create<{ variables: readonly RichTextVariable[]; menu: VariableMenuHandlers | null }>({
  name: "variableMenu",
  // Ahead of the other keys: while the list is open, Enter chooses from it rather than ending the line.
  priority: 1000,

  addOptions() {
    return { variables: [], menu: null };
  },

  addProseMirrorPlugins() {
    const { variables, menu } = this.options;
    if (!menu || !variables.length) return [];
    return [
      Suggestion<RichTextVariable, RichTextVariable>({
        editor: this.editor,
        pluginKey: VARIABLE_MENU_KEY,
        char: "{",
        allowedPrefixes: null,
        items: ({ query }) => matchVariables(variables, query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, { type: RICH_TEXT_NODES.variable, attrs: { key: props.key } }).run();
        },
        render: () => {
          const show = (p: SuggestionProps<RichTextVariable, RichTextVariable>) =>
            menu.onChange({ items: p.items, choose: (v) => p.command(v), rect: () => p.clientRect?.() ?? null });
          return { onStart: show, onUpdate: show, onExit: () => menu.onChange(null), onKeyDown: ({ event }) => menu.onKeyDown(event) };
        },
      }),
    ];
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
export function richTextExtensions({ marks, variables, placeholder, singleLine, variableMenu }: RichTextSchemaOptions): Extensions {
  const lists = marks.bullets && !singleLine;
  const out: Extensions = [
    singleLine ? Document.extend({ content: "paragraph" }) : Document,
    Paragraph,
    Text,
    VariableNode.configure({ variables }),
  ];
  if (variableMenu && variables.length) out.push(VariableMenu.configure({ variables, menu: variableMenu }));
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
