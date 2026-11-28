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

export interface RichTextMarks {
  bold?: boolean;
  italic?: boolean;
  bullets?: boolean;
  link?: (url: string) => boolean;
}

export interface RichTextSchemaOptions {
  marks: RichTextMarks;
  variables: readonly RichTextVariable[];
  placeholder?: string;
  singleLine?: boolean;
  variableMenu?: VariableMenuHandlers;
}

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

export interface VariableMenuState {
  items: readonly RichTextVariable[];
  choose: (v: RichTextVariable) => void;
  rect: () => DOMRect | null;
}

export interface VariableMenuHandlers {
  onChange: (menu: VariableMenuState | null) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const VARIABLE_MENU_KEY = new PluginKey("variableMenu");

export const closeVariableMenu = (view: EditorView) => exitSuggestion(view, VARIABLE_MENU_KEY);

export function matchVariables(variables: readonly RichTextVariable[], query: string): RichTextVariable[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...variables];
  const words = q.replace(/_/g, " ");
  return variables.filter((v) => {
    const label = v.label.toLowerCase();
    return v.key.startsWith(q) || label.startsWith(words) || label.split(/\s+/).some((w) => w.startsWith(words));
  });
}

const VariableMenu = Extension.create<{ variables: readonly RichTextVariable[]; menu: VariableMenuHandlers | null }>({
  name: "variableMenu",
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

const UnnestableListItem = ListItem.extend({
  content: "paragraph",
  addKeyboardShortcuts() {
    return { ...this.parent?.(), Tab: () => false };
  },
});

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
  if (lists) out.push(BulletList, UnnestableListItem);
  if (placeholder) out.push(Placeholder.configure({ placeholder, showOnlyWhenEditable: true }));
  if (singleLine) out.push(OneLine);
  return out;
}
