"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, TextQuote, Undo2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { fixEmphasisFlanking, listInWords, markdownReadable, productMarkdownExtensions, tidyMarkdown, unsupportedMarkdown } from "@/lib/markdown/product-markdown";
import { countWords } from "@/lib/seo/product-seo";
import { cn } from "@/lib/utils";
import { PRODUCT_BODY_STYLE } from "./body-style";
import type { MarkdownEditorProps } from "./markdown-editor";

type Mode = "visual" | "markdown";

const TOOL =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-press aria-pressed:bg-accent aria-pressed:text-foreground disabled:pointer-events-none disabled:opacity-40 max-md:h-11 max-md:min-w-11";

const SEPARATOR = <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

const LINK = /^(?:https?:\/\/\S+|\/\S*|mailto:\S+@\S+)$/i;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function LinkPopover({ editor, open, onOpenChange, children }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent align="start" className="w-80 space-y-2 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <LinkForm editor={editor} onDone={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [href, setHref] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const [bad, setBad] = useState(false);
  const inputId = useId();
  const editing = editor.isActive("link");
  const apply = () => {
    const url = href.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onDone();
    }
    if (!LINK.test(url)) return setBad(true);
    const { empty } = editor.state.selection;
    if (empty && !editing) {
      editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    onDone();
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label htmlFor={inputId} className="text-xs font-medium">
        Link address
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          autoFocus
          value={href}
          placeholder="https:// or /shop"
          aria-invalid={bad || undefined}
          aria-describedby={bad ? `${inputId}-bad` : undefined}
          className="h-9 text-base md:text-sm"
          onChange={(e) => {
            setHref(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onDone();
              editor.commands.focus();
            }
          }}
        />
        <Button type="submit" size="sm" className="h-9">
          {editing ? "Update" : "Add"}
        </Button>
      </div>
      {bad ? (
        <p id={`${inputId}-bad`} className="text-xs text-destructive">
          Use a full https:// address, a page of this site starting with /, or mailto:.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{editing ? "Leave it empty and press Update to remove the link." : "With no words selected, the address goes in as the link's words."}</p>
      )}
    </form>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullets: e.isActive("bulletList"),
      numbers: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const mod = isMac() ? "⌘" : "Ctrl+";
  const keep = (e: MouseEvent) => e.preventDefault();
  const tool = (label: string, shortcut: string | null, pressed: boolean | null, icon: ReactNode, run: () => void, disabled = false) => (
    <button
      type="button"
      className={TOOL}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed ?? undefined}
      disabled={disabled}
      onMouseDown={keep}
      onClick={run}
    >
      {icon}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <>
      {tool("Heading", `${mod}Alt+2`, s.h2, <Heading2 className="h-4 w-4" />, () => chain().toggleHeading({ level: 2 }).run())}
      {tool("Subheading", `${mod}Alt+3`, s.h3, <Heading3 className="h-4 w-4" />, () => chain().toggleHeading({ level: 3 }).run())}
      {SEPARATOR}
      {tool("Bold", `${mod}B`, s.bold, <Bold className="h-4 w-4" />, () => chain().toggleBold().run())}
      {tool("Italic", `${mod}I`, s.italic, <Italic className="h-4 w-4" />, () => chain().toggleItalic().run())}
      {SEPARATOR}
      {tool("Bulleted list", `${mod}Shift+8`, s.bullets, <List className="h-4 w-4" />, () => chain().toggleBulletList().run())}
      {tool("Numbered list", `${mod}Shift+7`, s.numbers, <ListOrdered className="h-4 w-4" />, () => chain().toggleOrderedList().run())}
      {tool("Quote", `${mod}Shift+B`, s.quote, <TextQuote className="h-4 w-4" />, () => chain().toggleBlockquote().run())}
      {SEPARATOR}
      {s.link
        ? tool("Remove link", null, null, <Unlink className="h-4 w-4" />, () => chain().extendMarkRange("link").unsetLink().run())
        : tool("Link", `${mod}K`, false, <Link2 className="h-4 w-4" />, onLink)}
      <span className="contents max-md:hidden">
        {SEPARATOR}
        {tool("Undo", `${mod}Z`, null, <Undo2 className="h-4 w-4" />, () => chain().undo().run(), !s.undo)}
        {tool("Redo", `${mod}Shift+Z`, null, <Redo2 className="h-4 w-4" />, () => chain().redo().run(), !s.redo)}
      </span>
    </>
  );
}

function VisualEditor({
  value,
  onChange,
  placeholder,
  id,
  labelledBy,
  describedBy,
  end,
}: Pick<MarkdownEditorProps, "value" | "onChange" | "placeholder" | "id"> & { labelledBy?: string; describedBy?: string; end: ReactNode }) {
  const shown = useRef(value);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const [linking, setLinking] = useState(false);
  const [extensions] = useState(() => [...productMarkdownExtensions(), Placeholder.configure({ placeholder }), UndoRedo, Markdown]);

  const editor = useEditor({
    extensions,
    content: fixEmphasisFlanking(value),
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        class: cn(
          PRODUCT_BODY_STYLE,
          "min-h-64 px-4 py-3 text-base outline-none md:text-[0.9375rem]",
          "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        ),
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinking(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = tidyMarkdown(e.getMarkdown());
      if (md === shown.current) return;
      shown.current = md;
      latest.current(md);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || value === shown.current) return;
    shown.current = value;
    editor.commands.setContent(fixEmphasisFlanking(value), { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="min-h-[18.5rem]" aria-hidden />;
  return (
    <>
      <LinkPopover editor={editor} open={linking} onOpenChange={setLinking}>
        <div role="toolbar" aria-label="Format the body" aria-controls={id} className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
          <Toolbar editor={editor} onLink={() => setLinking(true)} />
          {end}
        </div>
      </LinkPopover>
      <div className="max-h-[36rem] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

export default function MarkdownEditorImpl({ value, onChange, placeholder, id, counts = "words", ...aria }: MarkdownEditorProps) {
  const unsupported = useMemo(() => unsupportedMarkdown(value), [value]);
  const [mode, setMode] = useState<Mode>(() => (unsupported.length ? "markdown" : "visual"));
  const noteId = useId();
  const hintId = useId();
  const visualOff = unsupported.length > 0;
  const shownMode: Mode = visualOff ? "markdown" : mode;
  const why = visualOff ? `This body has ${listInWords(unsupported)}, which the visual editor can't show.` : null;
  const words = useMemo(() => countWords(markdownReadable(value), counts), [value, counts]);
  const mod = isMac() ? "⌘" : "Ctrl+";

  const switchTo = (next: Mode) => {
    if (next === "visual" && visualOff) return;
    setMode(next);
  };
  const onToggleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    switchTo(shownMode === "visual" ? "markdown" : "visual");
  };

  const modeToggle = (
    <div role="group" aria-label="How to edit" onKeyDown={onToggleKey} className="ml-auto inline-flex shrink-0 rounded-md border bg-background p-0.5">
      {(["visual", "markdown"] as const).map((m) => {
        const off = m === "visual" && visualOff;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={shownMode === m}
            aria-disabled={off || undefined}
            aria-describedby={off ? noteId : undefined}
            title={off ? (why ?? undefined) : undefined}
            onClick={() => switchTo(m)}
            className="inline-flex h-7 items-center rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-foreground max-md:h-11 max-md:px-3"
          >
            {m === "visual" ? "Visual" : "Markdown"}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      data-slot="markdown-editor"
      className="overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30"
    >
      {shownMode === "visual" ? (
        <VisualEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          id={id}
          labelledBy={aria["aria-labelledby"]}
          describedBy={hintId}
          end={modeToggle}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 max-md:px-1.5">
            <span className="text-xs text-muted-foreground max-md:hidden">Markdown</span>
            {modeToggle}
          </div>
          {why ? (
            <p id={noteId} className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {why} Edit it here as Markdown, or take it out to use the visual editor.
            </p>
          ) : null}
          <textarea
            id={id}
            value={value}
            placeholder={placeholder}
            aria-labelledby={aria["aria-labelledby"]}
            aria-describedby={hintId}
            spellCheck
            onChange={(e) => onChange(e.target.value)}
            className="block field-sizing-content min-h-64 max-h-[36rem] w-full resize-y bg-transparent px-4 py-3 font-mono text-base leading-relaxed outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </>
      )}
      <div id={hintId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {words.toLocaleString("en-SG")} {counts === "words" ? (words === 1 ? "word" : "words") : words === 1 ? "character" : "characters"}
        </span>
        <span className="max-md:hidden">
          {shownMode === "visual" ? `Styled as the shop shows it. ${mod}K adds a link.` : "## Heading   **bold**   *italic*   - list   [words](https://…)"}
        </span>
      </div>
    </div>
  );
}
