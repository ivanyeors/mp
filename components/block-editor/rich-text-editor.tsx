"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Italic, Link2, List, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { docFromValue, RICH_TEXT_NODES, valueFromDoc, type DocNode, type RichTextVariable } from "./rich-text-doc";
import { closeVariableMenu, richTextExtensions, type VariableMenuHandlers, type VariableMenuState } from "./rich-text-schema";
import type { RichTextProps } from "./rich-text";
import { RICH_TEXT_BOX } from "./rich-text-style";
import { RichTextView } from "./rich-text-view";
import { useVariableTargets, type VariableTarget } from "./variable-targets";

const TOOL = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm hover:bg-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground max-md:h-11 max-md:min-w-11";

function Toolbar({ editor, marks }: { editor: Editor; marks: NonNullable<RichTextProps["marks"]> }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullets: e.isActive("bulletList"),
    }),
  });
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const [bad, setBad] = useState(false);
  const allowed = marks.link;
  const keep = (e: MouseEvent) => e.preventDefault();

  if (linking && allowed) {
    const apply = () => {
      const url = href.trim();
      if (!allowed(url)) return setBad(true);
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      setLinking(false);
    };
    return (
      <div className="flex items-center gap-1 p-1" data-own-undo>
        <input
          aria-label="Link address"
          autoFocus
          value={href}
          placeholder="https://"
          aria-invalid={bad || undefined}
          className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm aria-invalid:border-destructive max-md:h-11"
          onChange={(e) => {
            setHref(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setLinking(false);
              editor.commands.focus();
            }
          }}
        />
        <button type="button" className={TOOL} onClick={apply}>
          Add link
        </button>
        {bad ? <span className="px-1 text-xs text-destructive">A link must be a full https:// address.</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 p-1" role="toolbar" aria-label="Format the words">
      {marks.bold ? (
        <button type="button" className={TOOL} aria-label="Bold" aria-pressed={active.bold} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </button>
      ) : null}
      {marks.italic ? (
        <button type="button" className={TOOL} aria-label="Italic" aria-pressed={active.italic} onMouseDown={keep} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </button>
      ) : null}
      {allowed ? (
        active.link ? (
          <button type="button" className={TOOL} aria-label="Remove link" onMouseDown={keep} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
            <Unlink className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className={TOOL}
            aria-label="Link"
            onMouseDown={keep}
            onClick={() => {
              setHref("");
              setBad(false);
              setLinking(true);
            }}
          >
            <Link2 className="h-4 w-4" />
          </button>
        )
      ) : null}
      {marks.bullets ? (
        <button type="button" className={TOOL} aria-label="Bulleted list" aria-pressed={active.bullets} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function useVariableMenu() {
  const [menu, setMenu] = useState<VariableMenuState | null>(null);
  const [active, setActive] = useState(0);
  const [said, setSaid] = useState({ text: "", n: 0 });
  const now = useRef({ menu, active });
  const say = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));

  const [handlers] = useState<VariableMenuHandlers & { choose: (v: RichTextVariable) => void; point: (i: number) => void }>(() => {
    const point = (i: number) => {
      const m = now.current.menu;
      if (!m?.items.length) return;
      const at = (i + m.items.length) % m.items.length;
      now.current.active = at;
      setActive(at);
      const v = m.items[at];
      say(`${v.label}${v.disabledReason ? `, ${v.disabledReason}` : ""}, ${at + 1} of ${m.items.length}`);
    };
    const choose = (v: RichTextVariable) => {
      if (v.disabledReason) return say(`${v.label}: ${v.disabledReason}.`);
      now.current.menu?.choose(v);
      say(`${v.label} added.`);
    };
    return {
      point,
      choose,
      onChange: (m) => {
        now.current = { menu: m, active: 0 };
        setMenu(m);
        setActive(0);
      },
      onKeyDown: (e) => {
        const m = now.current.menu;
        if (!m?.items.length) return false;
        if (e.key === "ArrowDown") point(now.current.active + 1);
        else if (e.key === "ArrowUp") point(now.current.active - 1);
        else if (e.key === "Enter" || e.key === "Tab") choose(m.items[now.current.active]);
        else return false;
        return true;
      },
    };
  });
  return { menu, active, said, handlers };
}

const MENU_WIDTH = 256;

function VariableMenuList({
  id,
  menu,
  active,
  onChoose,
}: {
  id: string;
  menu: VariableMenuState;
  active: number;
  onChoose: (v: RichTextVariable) => void;
}) {
  const rect = menu.rect();
  const placed = rect && (rect.width || rect.height || rect.left || rect.top);
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Variables"
      onMouseDown={(e) => e.preventDefault()}
      className={cn("z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md", placed ? "fixed" : "mt-1")}
      style={placed ? { left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)), top: rect.bottom + 4 } : undefined}
    >
      {menu.items.map((v, i) => (
        <div
          key={v.key}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === active}
          aria-disabled={v.disabledReason ? true : undefined}
          onClick={() => onChoose(v)}
          className="flex cursor-default flex-col rounded-md px-2 py-1.5 text-sm aria-disabled:opacity-60 aria-selected:bg-accent aria-selected:text-accent-foreground max-md:min-h-11"
        >
          <span className="font-medium">{v.label}</span>
          {v.disabledReason || v.description ? <span className="text-xs text-muted-foreground">{v.disabledReason ?? v.description}</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function RichTextEditor(props: RichTextProps) {
  const { value, marks = {}, variables = [], placeholder, singleLine, readOnly, id, className } = props;
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const shown = useRef(JSON.stringify(value));
  const menuId = useId();
  const variableMenu = useVariableMenu();

  const [extensions] = useState(() => richTextExtensions({ marks, variables, placeholder, singleLine, variableMenu: variableMenu.handlers }));
  const menuOpen = Boolean(variableMenu.menu?.items.length);

  const editor = useEditor({
    extensions,
    content: docFromValue(value),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": singleLine ? "false" : "true",
        ...(props["aria-label"] ? { "aria-label": props["aria-label"] } : {}),
        ...(props["aria-labelledby"] ? { "aria-labelledby": props["aria-labelledby"] } : {}),
        ...(props["aria-describedby"] ? { "aria-describedby": props["aria-describedby"] } : {}),
        ...(props["aria-invalid"] ? { "aria-invalid": "true" } : {}),
        ...(placeholder ? { "aria-placeholder": placeholder } : {}),
        ...(variables.length ? { "aria-autocomplete": "list" } : {}),
        ...(menuOpen ? { "aria-controls": menuId, "aria-activedescendant": `${menuId}-${variableMenu.active}` } : {}),
        class: cn(RICH_TEXT_BOX, singleLine && "min-h-9", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", className),
      },
      handleTextInput: (view, _from, _to, text) => {
        const { $from, empty } = view.state.selection;
        const onSlash = latest.current.onSlash;
        if (!onSlash || singleLine || text !== "/" || !empty || $from.parent.content.size !== 0) return false;
        onSlash();
        return true;
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      const next = valueFromDoc(e.getJSON() as DocNode, latest.current.variables ?? []);
      const json = JSON.stringify(next);
      if (json === shown.current) return;
      shown.current = json;
      const ui = transaction.getMeta("uiEvent");
      latest.current.onChange(next, { paste: transaction.getMeta("paste") === true || ui === "paste" || ui === "drop" });
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const json = JSON.stringify(value);
    if (json === shown.current) return;
    shown.current = json;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(docFromValue(value), { emitUpdate: false });
    if (editor.isFocused) {
      const end = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
    }
  }, [editor, value]);

  const targets = useVariableTargets();
  useEffect(() => {
    if (!editor || !targets || !variables.length) return;
    const target: VariableTarget = {
      get name() {
        const p = latest.current;
        const labelledBy = p["aria-labelledby"] ? document.getElementById(p["aria-labelledby"])?.textContent?.trim() : null;
        return p["aria-label"] ?? labelledBy ?? "the words";
      },
      insert: (v) => {
        if (editor.isDestroyed || !(latest.current.variables ?? []).some((x) => x.key === v.key)) return false;
        return editor.chain().focus().insertContent({ type: RICH_TEXT_NODES.variable, attrs: { key: v.key } }).run();
      },
    };
    const focused = () => targets.focused(target);
    editor.on("focus", focused);
    return () => {
      editor.off("focus", focused);
      targets.gone(target);
    };
  }, [editor, targets, variables.length]);

  useEffect(() => {
    if (!editor || !variables.length) return;
    const blurred = () => {
      if (!editor.isDestroyed) closeVariableMenu(editor.view);
    };
    editor.on("blur", blurred);
    return () => {
      editor.off("blur", blurred);
    };
  }, [editor, variables.length]);

  const hasTools = Boolean(marks.bold || marks.italic || marks.link || (marks.bullets && !singleLine));
  if (!editor) {
    return (
      <RichTextView
        value={value}
        variables={variables}
        placeholder={placeholder}
        singleLine={singleLine}
        className={className}
        id={id}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
      />
    );
  }
  return (
    <>
      <EditorContent editor={editor} />
      {menuOpen && variableMenu.menu ? (
        <VariableMenuList id={menuId} menu={variableMenu.menu} active={variableMenu.active} onChoose={variableMenu.handlers.choose} />
      ) : null}
      {variables.length ? (
        <span role="status" aria-live="polite" className="sr-only">
          <span key={variableMenu.said.n}>{variableMenu.said.text}</span>
        </span>
      ) : null}
      {hasTools ? (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, from, to }) => e.isEditable && from !== to}
          className="z-50 rounded-lg border bg-popover text-popover-foreground shadow-md"
        >
          <Toolbar editor={editor} marks={marks} />
        </BubbleMenu>
      ) : null}
    </>
  );
}
