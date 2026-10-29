"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Italic, Link2, List, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { docFromValue, valueFromDoc, type DocNode } from "./rich-text-doc";
import { richTextExtensions } from "./rich-text-schema";
import type { RichTextProps } from "./rich-text";
import { RICH_TEXT_BOX } from "./rich-text-style";
import { RichTextView } from "./rich-text-view";

/**
 * `RichText`'s TipTap editor (PRD-campaign-email-editor slice 04). Loaded on
 * its own, by `RichText`, so TipTap is in no page's first load. The value is
 * the page's: each change is mapped out of TipTap's document and emitted, and
 * a value that arrives from outside (Undo, Clear all, an AI draft) replaces
 * the document. TipTap's own history is left out: the page's history
 * (`useEditorHistory`) undoes the whole email, not one input.
 */

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
    // The address is not part of the page's history: ⌘Z here takes back what was typed in it, as in any field.
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

export default function RichTextEditor(props: RichTextProps) {
  const { value, marks = {}, variables = [], placeholder, singleLine, readOnly, id, className } = props;
  // The latest props, for TipTap's callbacks, which it keeps from when it was made.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  // What this input last emitted or was given: a value equal to it is already on screen.
  const shown = useRef(JSON.stringify(value));

  // The schema is the page's, fixed for the input's life.
  const [extensions] = useState(() => richTextExtensions({ marks, variables, placeholder, singleLine }));

  const editor = useEditor({
    extensions,
    content: docFromValue(value),
    editable: !readOnly,
    immediatelyRender: false,
    // Given again on each render, so the attributes follow the props (an error, its description).
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
        class: cn(RICH_TEXT_BOX, singleLine && "min-h-9", "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", className),
      },
      // `/` typed in an empty line opens the page's block menu instead of typing a slash.
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

  // A value from outside: Undo, Clear all, a draft. The cursor stays where it was, as near as it can.
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

  const hasTools = Boolean(marks.bold || marks.italic || marks.link || (marks.bullets && !singleLine));
  // The editor is made after the first paint: until then, the words as they read.
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
