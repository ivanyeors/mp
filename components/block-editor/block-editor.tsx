"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Accessibility, defaultPreset, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/dom";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sortableMove } from "@/lib/dnd/sortable-move";
import { cn } from "@/lib/utils";
import { addedText, dropIndex, duplicateBlock, insertBlocks, moveBlock, movedText, noRoomText, removeBlock } from "./block-moves";
import type { RichTextVariable } from "./rich-text-doc";
import type { BlockCatalogue, BlockKind, EditorBlock, PaletteItem } from "./types";
import { VariableTargets } from "./variable-targets";

/**
 * The shared block editor (PRD-campaign-email-editor slice 04, decision 1):
 * a column of blocks a page's own types fill, with a palette beside it. Drag
 * a block or a Starter in from the palette (a line shows where it lands,
 * always between two blocks or at the end), drag a card by its handle to
 * move it, or do either from the keyboard: Enter on a palette item, `+`
 * between blocks, `/` in an empty text line, the block menu's *Move up* and
 * *Move down*, or dnd-kit's keyboard sensor on the handle. Every move is
 * announced. It knows nothing about email.
 *
 * `BlockEditorRoot` holds the blocks and the drag and drop for everything
 * inside it, so the page lays out `BlockPalette` and `BlockEditor` (the
 * column) where it wants them; and the page's Variables (slice 13), with the
 * text input inside it that a Variables palette's chip lands in.
 */

/** The column's end: a drop here lands after the last block. */
const END = "block-editor:end";

const NO_VARIABLES: readonly RichTextVariable[] = [];

/** dnd-kit's events, as its handlers receive them. */
type StartEvent = Parameters<DragStartEvent>[0];
type OverEvent = Parameters<DragOverEvent>[0];
type MoveEvent = Parameters<DragMoveEvent>[0];
type EndEvent = Parameters<DragEndEvent>[0];

/** What a palette item's draggable carries. */
export type PaletteDrag = { palette: PaletteItem<EditorBlock> };
/** What a block's card carries: what a screen reader hears when it is picked up. */
type CardDrag = { label: string; position: number; of: number };

const isPaletteDrag = (data: unknown): data is PaletteDrag =>
  typeof data === "object" && data !== null && "palette" in data;
const isCardDrag = (data: unknown): data is CardDrag => typeof data === "object" && data !== null && "position" in data;

/** dnd-kit's plugins, its announcements naming blocks by their labels, not their ids. */
const PLUGINS = defaultPreset.plugins.map((p) =>
  p === Accessibility
    ? Accessibility.configure({
        announcements: {
          dragstart: ({ operation: { source } }: StartEvent) => {
            if (isPaletteDrag(source?.data)) return `Picked up ${source.data.palette.label}.`;
            if (isCardDrag(source?.data)) return `Picked up ${source.data.label}, at position ${source.data.position} of ${source.data.of}.`;
          },
          dragend: ({ operation: { source }, canceled }: EndEvent) => (canceled && source ? "Put back where it was." : undefined),
        },
      })
    : p,
);

interface Focus {
  id: string;
  /** Into the block's first field, or onto the card itself (after a delete, the block above). */
  into: boolean;
}

interface BlockEditorContext {
  blocks: readonly EditorBlock[];
  catalogue: Record<string, BlockKind<EditorBlock>>;
  /** The page's Variables, which its text inputs offer and the Variables palette lists. */
  variables: readonly RichTextVariable[];
  readOnly: boolean;
  /** Why nothing more can be added, or null. */
  full: string | null;
  /** Why these many blocks can't be added (a Starter's), or null when they fit. */
  noRoom: (adds: number) => string | null;
  selected: string | null;
  select: (id: string | null) => void;
  /** Adds blocks at `at`, focuses the first and says so; all of them, or none when they don't fit. */
  insert: (at: number, added: EditorBlock[]) => void;
  /** Adds blocks after the selected one, or at the end. */
  add: (added: EditorBlock[]) => void;
  move: (from: number, to: number) => void;
  duplicate: (i: number) => void;
  remove: (i: number) => void;
  update: (i: number, b: EditorBlock, burst?: string) => void;
  /** Where a palette drag would land now. */
  drop: number | null;
  focus: Focus | null;
  focused: () => void;
}

const Ctx = createContext<BlockEditorContext | null>(null);

export function useBlockEditor(): BlockEditorContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBlockEditor needs a BlockEditorRoot around it.");
  return ctx;
}

const kindOf = (ctx: Pick<BlockEditorContext, "catalogue">, b: EditorBlock) => ctx.catalogue[b.type];

export function BlockEditorRoot<B extends EditorBlock>({
  blocks: given,
  catalogue,
  onChange,
  selected,
  onSelect,
  readOnly = false,
  max = Infinity,
  newId,
  variables = NO_VARIABLES,
  children,
}: {
  blocks: readonly B[];
  catalogue: BlockCatalogue<B>;
  /** Every change, as the whole list. `burst` is a run of typing in one field: one step of history. */
  onChange: (next: B[], burst?: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Shown as it is: no palette, no drag, no menus. */
  readOnly?: boolean;
  /** The most blocks the page takes. */
  max?: number;
  /** A new block id, for *Duplicate*. */
  newId: () => string;
  /**
   * The page's Variables (slice 13): its block forms read them from
   * `useBlockEditor()`, and a `VariablePalette` inside lists them. Its chips
   * land in the `RichText` inside that was last written in.
   */
  variables?: readonly RichTextVariable[];
  children: ReactNode;
}) {
  const blocks = given as readonly EditorBlock[];
  const cat = catalogue as unknown as Record<string, BlockKind<EditorBlock>>;
  const [announced, setAnnounced] = useState({ text: "", n: 0 });
  const announce = useCallback((text: string) => setAnnounced((a) => ({ text, n: a.n + 1 })), []);
  const [focus, setFocus] = useState<Focus | null>(null);
  const focused = useCallback(() => setFocus(null), []);
  const [drop, setDrop] = useState<number | null>(null);
  const full = blocks.length >= max ? `At most ${max} blocks: delete one to add another.` : null;
  const label = (b: EditorBlock | undefined) => (b ? (cat[b.type]?.label ?? b.type) : "Block");

  const change = (next: EditorBlock[], burst?: string) => onChange(next as B[], burst);
  const room = Math.max(0, max - blocks.length);
  const noRoom = (adds: number) => (adds > room ? (full ?? noRoomText(adds, room, max)) : null);
  const insert = (at: number, added: EditorBlock[]) => {
    const next = insertBlocks(blocks, at, added, max);
    if (next === blocks) {
      const why = noRoom(added.length);
      if (why) announce(why);
      return;
    }
    const first = added[0];
    change(next);
    onSelect(first.id);
    setFocus({ id: first.id, into: true });
    const where = Math.min(at, blocks.length);
    announce(added.length > 1 ? `${added.length} blocks added at position ${where + 1} of ${next.length}.` : addedText(label(first), where, next.length));
  };
  const ctx: BlockEditorContext = {
    blocks,
    catalogue: cat,
    variables,
    readOnly,
    full,
    noRoom,
    selected,
    select: onSelect,
    insert,
    add: (added) => {
      const i = blocks.findIndex((b) => b.id === selected);
      insert(i === -1 ? blocks.length : i + 1, added);
    },
    move: (from, to) => {
      const next = moveBlock(blocks, from, to);
      if (next === blocks) return;
      change(next);
      announce(movedText(label(blocks[from]), to, next.length));
    },
    duplicate: (i) => {
      const next = duplicateBlock(blocks, i, newId, max);
      if (next === blocks) return;
      change(next);
      onSelect(next[i + 1].id);
      setFocus({ id: next[i + 1].id, into: true });
      announce(`${label(blocks[i])} duplicated: the copy is at position ${i + 2} of ${next.length}.`);
    },
    remove: (i) => {
      const gone = blocks[i];
      const next = removeBlock(blocks, i);
      if (next === blocks) return;
      change(next);
      const near = next[i - 1] ?? next[i] ?? null;
      onSelect(near?.id ?? null);
      if (near) setFocus({ id: near.id, into: false });
      announce(`${label(gone)} deleted.`);
    },
    update: (i, b, burst) => change(blocks.map((x, j) => (j === i ? b : x)), burst),
    drop,
    focus,
    focused,
  };

  /** Where a palette item would land: over a block's top half, before it; its bottom half, after it. */
  const landing = (event: OverEvent | MoveEvent | EndEvent): number | null => {
    const { source, target, position } = event.operation;
    if (!source || !isPaletteDrag(source.data) || !target) return null;
    if (target.id === END) return blocks.length;
    const i = blocks.findIndex((b) => b.id === target.id);
    if (i === -1) return null;
    const rect = target.element?.getBoundingClientRect();
    return rect && rect.height ? dropIndex(i, rect, position.current.y) : i;
  };
  const track = (event: OverEvent | MoveEvent) => {
    if (!isPaletteDrag(event.operation.source?.data)) return;
    const at = landing(event);
    setDrop((d) => (d === at ? d : at));
  };

  return (
    <Ctx.Provider value={ctx}>
      <DragDropProvider
        plugins={PLUGINS}
        onDragOver={track}
        onDragMove={track}
        onDragEnd={(event) => {
          const source = event.operation.source;
          if (isPaletteDrag(source?.data)) {
            const at = landing(event) ?? drop;
            setDrop(null);
            if (!event.canceled && at !== null && !readOnly) insert(at, source.data.palette.blocks());
            return;
          }
          const from = blocks.findIndex((b) => b.id === source?.id);
          const next = sortableMove(blocks, event, (b) => b.id);
          if (!next || from === -1) return;
          const to = next.findIndex((b) => b.id === source?.id);
          change(next);
          announce(movedText(label(blocks[from]), to, next.length));
        }}
      >
        <VariableTargets>{children}</VariableTargets>
      </DragDropProvider>
      <div role="status" aria-live="polite" className="sr-only">
        <span key={announced.n}>{announced.text}</span>
      </div>
    </Ctx.Provider>
  );
}

/**
 * The block types as a menu: the `+` between blocks, *Add block* at the end,
 * and `/` in a text line. A menu's button is a plain `<button>` styled as a
 * `Button`: the `Button` also presses itself on Enter (its tap animation), and
 * the two presses would open the menu and shut it again for a keyboard user.
 */
function InsertMenu({
  at,
  trigger,
  open,
  onOpenChange,
  align = "start",
  returnFocus,
}: {
  at: number;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center";
  /** Where focus goes back to when the menu closes with nothing chosen (the text line `/` was typed in). */
  returnFocus?: () => void;
}) {
  const ctx = useBlockEditor();
  const chose = useRef(false);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-72"
        onCloseAutoFocus={(e) => {
          // The new block takes focus; with nothing chosen, focus goes back where it was.
          if (chose.current || returnFocus) e.preventDefault();
          if (!chose.current) returnFocus?.();
          chose.current = false;
        }}
      >
        {Object.entries(ctx.catalogue).map(([type, kind]) => {
          const Icon = kind.icon;
          return (
            <DropdownMenuItem
              key={type}
              disabled={Boolean(ctx.full)}
              onSelect={() => {
                chose.current = true;
                ctx.insert(at, [kind.create()]);
              }}
            >
              <Icon className="h-4 w-4" />
              <span>
                <span className="block">{kind.label}</span>
                <span className="block text-xs text-muted-foreground">{kind.description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FIELD = 'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"]';

/**
 * Focus into a block once it is on screen: its first field, or the card. It
 * waits for a menu that asked for it to close and let go of focus, and a text
 * field that loads a moment later (`RichText`) takes it when it comes, if
 * nothing else has been focused since.
 */
function useFocusRequest(card: RefObject<HTMLElement | null>, request: Focus | null, done: () => void) {
  const pending = useRef<{ timer?: ReturnType<typeof setTimeout>; watch?: MutationObserver }>({});
  useEffect(() => {
    const p = pending.current;
    return () => {
      clearTimeout(p.timer);
      p.watch?.disconnect();
    };
  }, []);
  useEffect(() => {
    const el = card.current;
    if (!el || !request) return;
    queueMicrotask(done);
    const p = pending.current;
    clearTimeout(p.timer);
    p.watch?.disconnect();
    p.timer = setTimeout(() => {
      const field = () => el.querySelector<HTMLElement>(`[data-block-body] :is(${FIELD})`);
      const now = request.into ? field() : null;
      (now ?? el).focus();
      if (!request.into || now) return;
      const watch = new MutationObserver(() => {
        const f = field();
        if (!f) return;
        watch.disconnect();
        if (document.activeElement === el) f.focus();
      });
      p.watch = watch;
      watch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
      p.timer = setTimeout(() => watch.disconnect(), 3000);
    }, 0);
  }, [card, request, done]);
}

function BlockCard({ block, index, errors }: { block: EditorBlock; index: number; errors: Record<string, string> }) {
  const ctx = useBlockEditor();
  const kind = kindOf(ctx, block);
  const total = ctx.blocks.length;
  const { ref, handleRef, isDragging } = useSortable({
    id: block.id,
    index,
    disabled: ctx.readOnly,
    data: { label: kind?.label ?? block.type, position: index + 1, of: total } satisfies CardDrag,
  });
  const card = useRef<HTMLLIElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLLIElement | null) => {
      card.current = el;
      ref(el);
    },
    [ref],
  );
  const request = ctx.focus?.id === block.id ? ctx.focus : null;
  useFocusRequest(card, request, ctx.focused);

  const [slash, setSlash] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  // Duplicate and Delete move focus themselves: the menu must not take it back to its button.
  const focusMoves = useRef(false);
  const selected = ctx.selected === block.id;
  const select = () => {
    if (!selected) ctx.select(block.id);
  };

  if (!kind) return null;
  const Icon = kind.icon;
  const Form = kind.Form;
  const Options = kind.Options;
  const name = `${kind.label}, block ${index + 1} of ${total}`;
  const props = {
    block,
    onChange: (next: EditorBlock, burst?: string) => ctx.update(index, next, burst),
    readOnly: ctx.readOnly,
    errors,
    idPrefix: `block-${block.id}`,
    onSlash: () => {
      back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSlash(true);
    },
  };

  return (
    <li
      ref={setRefs}
      data-block-id={block.id}
      data-selected={selected || undefined}
      tabIndex={-1}
      aria-label={name}
      onFocusCapture={select}
      onPointerDown={select}
      className={cn(
        "group/card relative rounded-lg border bg-card outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50",
        selected && "border-primary/60 ring-1 ring-primary/30",
        isDragging && "z-50 opacity-70 shadow-lg",
      )}
    >
      {ctx.drop === index ? <DropLine edge="top" /> : null}
      {ctx.drop === total && index === total - 1 ? <DropLine edge="bottom" /> : null}
      {index > 0 && !ctx.readOnly ? (
        <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 max-lg:hidden">
          <InsertMenu
            at={index}
            align="center"
            trigger={
              <button
                type="button"
                aria-label={`Add a block before ${kind.label}, block ${index + 1}`}
                disabled={Boolean(ctx.full)}
                className="inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
      ) : null}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {ctx.readOnly ? null : (
          <button
            ref={handleRef}
            type="button"
            aria-label={`Drag ${kind.label}, block ${index + 1}, to move it`}
            className="inline-flex min-h-8 min-w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing max-md:min-h-11 max-md:min-w-11"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{kind.label}</span>
        {ctx.readOnly ? null : (
          <InsertMenu
            at={index + 1}
            open={slash}
            onOpenChange={setSlash}
            returnFocus={() => back.current?.focus()}
            trigger={<span aria-hidden className="pointer-events-none size-0" />}
          />
        )}
        {ctx.readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "ml-auto h-8 w-8")} aria-label={`Actions for ${kind.label}, block ${index + 1}`}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                if (focusMoves.current) e.preventDefault();
                focusMoves.current = false;
              }}
            >
              <DropdownMenuItem disabled={index === 0} onSelect={() => ctx.move(index, index - 1)}>
                <ArrowUp className="h-4 w-4" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === total - 1} onSelect={() => ctx.move(index, index + 1)}>
                <ArrowDown className="h-4 w-4" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(ctx.full)}
                onSelect={() => {
                  focusMoves.current = true;
                  ctx.duplicate(index);
                }}
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  focusMoves.current = true;
                  ctx.remove(index);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div data-block-body className="px-3 pb-3 pt-1">
        <Form {...props} />
      </div>
      {selected && Options && !ctx.readOnly ? (
        <div className="border-t bg-muted/30 px-3 py-2.5" role="group" aria-label={`${kind.label} options`}>
          <Options {...props} />
        </div>
      ) : null}
    </li>
  );
}

function DropLine({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      data-drop-line
      className={cn("pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-primary", edge === "top" ? "-top-2" : "-bottom-2")}
    />
  );
}

/** The drop zone after the last block, and *Add block*. */
function ColumnEnd({ addLabel }: { addLabel: string }) {
  const ctx = useBlockEditor();
  const { ref, isDropTarget } = useDroppable({ id: END, disabled: ctx.readOnly });
  const empty = ctx.blocks.length === 0;
  if (ctx.readOnly) return null;
  return (
    <div ref={ref} className={cn("relative rounded-lg", empty && ctx.drop === 0 && "ring-2 ring-primary", isDropTarget && !empty && "bg-muted/40")}>
      <InsertMenu
        at={ctx.blocks.length}
        trigger={
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })} disabled={Boolean(ctx.full)}>
            <Plus className="mr-1 h-4 w-4" />
            {addLabel}
          </button>
        }
      />
      {ctx.full ? <p className="mt-1 text-xs text-muted-foreground">{ctx.full}</p> : null}
    </div>
  );
}

/**
 * The column of blocks: each a card showing the block as it will read,
 * editable in place, with its handle, its menu and, when selected, its
 * options under it. `errors` are Save's, keyed `<path>.<index>.<field>`.
 */
export function BlockEditor({
  label,
  empty,
  errors = {},
  errorPath = "blocks",
  addLabel = "Add block",
}: {
  /** The list's name, for a screen reader: "The email's blocks". */
  label: string;
  /** What an empty column says. */
  empty: ReactNode;
  errors?: Record<string, string>;
  errorPath?: string;
  addLabel?: string;
}) {
  const ctx = useBlockEditor();
  const byBlock = useMemo(() => {
    const out: Record<string, string>[] = ctx.blocks.map(() => ({}));
    for (const [key, message] of Object.entries(errors)) {
      const m = key.startsWith(`${errorPath}.`) ? /^(\d+)\.(.+)$/.exec(key.slice(errorPath.length + 1)) : null;
      if (m && out[Number(m[1])]) out[Number(m[1])][m[2]] ??= message;
    }
    return out;
  }, [ctx.blocks, errors, errorPath]);
  return (
    <div className="space-y-3">
      {ctx.blocks.length ? (
        <ol className="space-y-4" aria-label={label}>
          {ctx.blocks.map((b, i) => (
            <BlockCard key={b.id} block={b} index={i} errors={byBlock[i]} />
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</div>
      )}
      {errors[errorPath] ? <p className="text-xs text-destructive">{errors[errorPath]}</p> : null}
      <ColumnEnd addLabel={addLabel} />
    </div>
  );
}
