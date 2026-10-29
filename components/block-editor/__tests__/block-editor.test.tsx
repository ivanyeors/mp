// @vitest-environment jsdom
import { byLabel, choose, click, pointAt, press, richTextIn, settle, typeField, typeInto } from "./dom";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Minus, Pilcrow, StickyNote } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDragDropManager } from "@dnd-kit/react";
import { BlockEditor, BlockEditorRoot, useBlockEditor } from "../block-editor";
import { BlockPalette, blockPaletteTab } from "../block-palette";
import { RichText } from "../rich-text";
import type { BlockCatalogue, BlockFormProps, PaletteItemsTab } from "../types";
import { typingBurst, useEditorHistory, useHistoryKeys } from "../use-editor-history";

/**
 * The shared block editor (PRD-campaign-email-editor slice 04) with a page's
 * own made-up block types, as Staff use it: add from the palette by click,
 * drag in from the palette to a spot, `+` and `/`, move by drag and by the
 * block menu, duplicate and delete, and undo and redo each.
 *
 * dnd-kit measures the screen, which jsdom has none of, so a drag is played
 * through the provider's own handlers with the events dnd-kit sends.
 */

type DragHandlers = Pick<ComponentProps<typeof import("@dnd-kit/react").DragDropProvider>, "onDragOver" | "onDragMove" | "onDragEnd">;
const dnd = vi.hoisted(() => ({ handlers: null as DragHandlers | null }));
vi.mock("@dnd-kit/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/react")>();
  return {
    ...actual,
    DragDropProvider: (props: ComponentProps<typeof actual.DragDropProvider>) => {
      dnd.handlers = props;
      return <actual.DragDropProvider {...props} />;
    },
  };
});

type Note = { id: string; type: "note"; text: string; tone: "plain" | "loud" };
type Para = { id: string; type: "para"; words: string };
type Line = { id: string; type: "line" };
type B = Note | Para | Line;

let ids = 0;
const nid = () => `b${++ids}`;

function NoteForm({ block, onChange, readOnly, idPrefix }: BlockFormProps<Note>) {
  return (
    <input
      id={`${idPrefix}-text`}
      aria-label="Note"
      value={block.text}
      disabled={readOnly}
      onChange={(e) => onChange({ ...block, text: e.target.value }, typingBurst(e, `${idPrefix}-text`))}
    />
  );
}
function NoteOptions({ block, onChange }: BlockFormProps<Note>) {
  return (
    <button type="button" onClick={() => onChange({ ...block, tone: block.tone === "loud" ? "plain" : "loud" })}>
      Tone: {block.tone}
    </button>
  );
}
function ParaForm({ block, onChange, readOnly, onSlash }: BlockFormProps<Para>) {
  const words = block.words;
  return (
    <RichText
      aria-label="Paragraph"
      value={words ? [{ kind: "p", runs: [{ text: words }] }] : []}
      readOnly={readOnly}
      onSlash={onSlash}
      onChange={(v) => onChange({ ...block, words: v.map((p) => (p.kind === "p" ? p.runs.map((r) => ("text" in r ? r.text : "")).join("") : "")).join("\n") })}
    />
  );
}

const CATALOGUE: BlockCatalogue<B> = {
  note: { label: "Note", description: "A line of words", icon: StickyNote, create: () => ({ id: nid(), type: "note", text: "", tone: "plain" }), Form: NoteForm, Options: NoteOptions },
  para: { label: "Paragraph", description: "Words with a slash menu", icon: Pilcrow, create: () => ({ id: nid(), type: "para", words: "" }), Form: ParaForm },
  line: { label: "Line", description: "A rule across", icon: Minus, create: () => ({ id: nid(), type: "line" }), Form: () => <hr /> },
};
const PALETTE = [blockPaletteTab(CATALOGUE)];

let seen: B[] = [];
const report = (blocks: B[]) => {
  seen = blocks;
};
function Harness({ initial, readOnly = false, extra }: { initial: B[]; readOnly?: boolean; extra?: ReactNode }) {
  const history = useEditorHistory<B[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useHistoryKeys(history, { within: area, enabled: !readOnly });
  useEffect(() => report(history.value));
  return (
    <div ref={area}>
      <BlockEditorRoot
        blocks={history.value}
        catalogue={CATALOGUE}
        onChange={(next, burst) => history.set(next, { burst })}
        selected={selected}
        onSelect={setSelected}
        readOnly={readOnly}
        max={6}
        newId={nid}
      >
        {readOnly ? null : <BlockPalette tabs={PALETTE} />}
        <BlockEditor label="The blocks" empty="Nothing yet." />
        {extra}
      </BlockEditorRoot>
    </div>
  );
}

/** What a test reaches inside the editor: its context, and dnd-kit's manager. */
const probed: { editor: ReturnType<typeof useBlockEditor> | null; manager: ReturnType<typeof useDragDropManager> } = { editor: null, manager: null };
function EditorProbe() {
  const editor = useBlockEditor();
  useEffect(() => {
    probed.editor = editor;
  });
  return null;
}
function ManagerProbe() {
  const manager = useDragDropManager();
  useEffect(() => {
    probed.manager = manager;
  });
  return null;
}

let root: Root | null = null;
function mount(initial: B[], readOnly = false, extra?: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness initial={initial} readOnly={readOnly} extra={extra} />));
}
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(20);
  document.body.innerHTML = "";
});

const cards = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
const order = () => seen.map((b) => (b.type === "note" ? `note:${b.text}` : b.type));
const announced = () => document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? "";
const paletteItem = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Blocks'] button")].find((b) => b.textContent?.startsWith(label))!;
const START: B[] = [
  { id: "n1", type: "note", text: "Sleep cooler", tone: "plain" },
  { id: "n2", type: "note", text: "Our covers are back", tone: "plain" },
];

/** A palette item's drag: over a card (or the column's end), then dropped. */
function dragFromPalette(label: string, overId: string, element?: HTMLElement) {
  const palette = PALETTE[0].items.find((i) => i.label === label)!;
  const operation = {
    source: { id: `palette:blocks:${palette.id}`, data: { palette } },
    target: { id: overId, element },
    position: { current: { x: 0, y: 0 } },
  };
  return {
    over: () => act(() => dnd.handlers!.onDragOver!({ operation } as never, {} as never)),
    drop: () => act(() => dnd.handlers!.onDragEnd!({ operation, canceled: false } as never, {} as never)),
  };
}

describe("adding blocks", () => {
  it("adds a palette item after the selected block with a click, empty and focused, and says so", async () => {
    mount(START);
    expect(paletteItem("Note").tagName).toBe("BUTTON"); // Enter presses it, as a click
    await click(paletteItem("Line"));
    expect(order()).toEqual(["note:Sleep cooler", "note:Our covers are back", "line"]);
    expect(announced()).toBe("Line added at position 3 of 3.");
    await settle();
    expect(document.activeElement).toBe(cards()[2]); // a line has no field: its card

    await pointAt(cards()[0]);
    await click(paletteItem("Note"));
    await settle();
    expect(order()).toEqual(["note:Sleep cooler", "note:", "note:Our covers are back", "line"]);
    expect(document.activeElement).toBe(cards()[1].querySelector("input"));
    expect(cards()[1].dataset.selected).toBe("true");
  });

  it("drops a dragged palette item where the line shows: between two blocks, or at the end", () => {
    mount(START);
    const between = dragFromPalette("Line", "n2", cards()[1]);
    between.over();
    expect(cards()[1].querySelector("[data-drop-line]")).not.toBeNull();
    expect(cards()[0].querySelector("[data-drop-line]")).toBeNull();
    between.drop();
    expect(order()).toEqual(["note:Sleep cooler", "line", "note:Our covers are back"]);
    expect(document.querySelector("[data-drop-line]")).toBeNull();

    const end = dragFromPalette("Note", "block-editor:end");
    end.over();
    expect(cards().at(-1)!.querySelector("[data-drop-line]")).not.toBeNull();
    end.drop();
    expect(order()).toEqual(["note:Sleep cooler", "line", "note:Our covers are back", "note:"]);
  });

  it("adds from the + between blocks and from Add block at the end", async () => {
    mount(START);
    await choose(byLabel("Add a block before Note, block 2")!, "Line");
    expect(order()).toEqual(["note:Sleep cooler", "line", "note:Our covers are back"]);
    await choose(byLabel("Add block")!, "Note");
    expect(order()).toEqual(["note:Sleep cooler", "line", "note:Our covers are back", "note:"]);
  });

  it("opens the block menu for / typed in an empty line, and adds the choice after the block", async () => {
    mount([{ id: "p1", type: "para", words: "" }]);
    const editor = await richTextIn(cards()[0]);
    typeInto(editor, "/");
    await settle();
    expect(seen).toEqual([{ id: "p1", type: "para", words: "" }]); // the slash is not typed
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.startsWith("Line"))!;
    await click(item);
    expect(order()).toEqual(["para", "line"]);
    // In a line with words, a slash is a slash.
    typeInto(editor, "1/2");
    await settle();
    expect(seen[0]).toEqual({ id: "p1", type: "para", words: "1/2" });
  });

  it("stops at the page's most blocks, saying why", async () => {
    mount(Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, type: "line" as const })));
    expect(paletteItem("Line").getAttribute("aria-disabled")).toBe("true");
    await click(paletteItem("Line"));
    expect(seen).toHaveLength(6);
    expect(document.body.textContent).toContain("At most 6 blocks: delete one to add another.");
  });

  it("puts a Starter's several blocks in whole or not at all, and says how many went in", async () => {
    const STARTERS: PaletteItemsTab<B> = {
      value: "starters",
      label: "Starters",
      items: [{ id: "trio", label: "Trio", blocks: () => [CATALOGUE.note.create(), CATALOGUE.line.create(), CATALOGUE.note.create()] }],
    };
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, type: "line" as const }));
    const trio = () => document.querySelector<HTMLButtonElement>("ul[aria-label='Starters'] button")!;
    const tooBig = "This adds 3 blocks, and there is room for 2 more: at most 6.";

    mount(lines(4), false, [<BlockPalette key="s" tabs={[STARTERS]} />, <EditorProbe key="p" />]);
    expect(trio().getAttribute("aria-disabled")).toBe("true");
    expect(trio().title).toBe(tooBig);
    await click(trio());
    expect(seen).toHaveLength(4);
    // Put in another way (the editor's own insert), it is refused the same, and the reason said.
    act(() => probed.editor!.insert(4, STARTERS.items[0].blocks()));
    expect(seen).toHaveLength(4);
    expect(announced()).toBe(tooBig);
    act(() => root!.unmount());

    mount(lines(3), false, <BlockPalette tabs={[STARTERS]} />);
    await click(trio());
    expect(order()).toEqual(["line", "line", "line", "note:", "line", "note:"]);
    expect(announced()).toBe("3 blocks added at position 4 of 6.");
  });

  it("keeps the palette draggable after the phone's Add sheet, a second palette, opens and closes", async () => {
    const draggableOf = (el: Element) => [...probed.manager!.registry.draggables].find((d) => d.element === el);
    mount(START, false, <ManagerProbe />);
    await settle();
    expect(draggableOf(paletteItem("Note"))).toBeDefined();
    act(() => root!.render(<Harness initial={START} extra={[<ManagerProbe key="p" />, <BlockPalette key="sheet" tabs={PALETTE} draggable={false} />]} />));
    await settle();
    act(() => root!.render(<Harness initial={START} extra={<ManagerProbe />} />));
    await settle();
    expect(draggableOf(paletteItem("Note"))).toBeDefined();
  });
});

describe("moving, duplicating and deleting", () => {
  it("moves a block by drag and by the block menu, and announces where it went", async () => {
    mount([...START, { id: "l1", type: "line" }]);
    // dnd-kit has already projected the dragged card into its new slot: the source's index.
    act(() => dnd.handlers!.onDragEnd!({ operation: { source: { id: "l1", index: 0 }, target: { id: "l1" } }, canceled: false } as never, {} as never));
    expect(order()).toEqual(["line", "note:Sleep cooler", "note:Our covers are back"]);
    expect(announced()).toBe("Line moved to position 1 of 3.");

    await choose(byLabel("Actions for Note, block 3")!, "Move up");
    expect(order()).toEqual(["line", "note:Our covers are back", "note:Sleep cooler"]);
    expect(announced()).toBe("Note moved to position 2 of 3.");
    await choose(byLabel("Actions for Line, block 1")!, "Move down");
    expect(order()).toEqual(["note:Our covers are back", "line", "note:Sleep cooler"]);
    // A drag let go where it started changes nothing.
    act(() => dnd.handlers!.onDragEnd!({ operation: { source: { id: "l1", index: 1 }, target: { id: "l1" } }, canceled: false } as never, {} as never));
    expect(order()).toEqual(["note:Our covers are back", "line", "note:Sleep cooler"]);
  });

  it("duplicates a block with its own id, focusing the copy, and deletes, focusing the block above", async () => {
    mount(START);
    await choose(byLabel("Actions for Note, block 1")!, "Duplicate");
    await settle();
    expect(order()).toEqual(["note:Sleep cooler", "note:Sleep cooler", "note:Our covers are back"]);
    expect(new Set(seen.map((b) => b.id)).size).toBe(3);
    expect(document.activeElement).toBe(cards()[1].querySelector("input"));

    await choose(byLabel("Actions for Note, block 3")!, "Delete");
    await settle();
    expect(order()).toEqual(["note:Sleep cooler", "note:Sleep cooler"]);
    expect(document.activeElement).toBe(cards()[1]);
    expect(announced()).toBe("Note deleted.");
  });

  it("shows the selected block's options under it", async () => {
    mount(START);
    expect(byLabel("Tone: plain")).toBeNull();
    await pointAt(cards()[1]);
    await click(byLabel("Tone: plain")!);
    expect(seen[1]).toMatchObject({ tone: "loud" });
  });
});

describe("undo and redo", () => {
  it("undoes and redoes every change, a burst of typing as one step and a paste as its own", async () => {
    mount(START);
    const field = () => cards()[0].querySelector("input")!;
    typeField(field(), "Sleep cooler t");
    typeField(field(), "Sleep cooler th");
    typeField(field(), "Sleep cooler this");
    typeField(field(), "Sleep cooler this December", "insertFromPaste");
    await click(paletteItem("Line"));
    await choose(byLabel("Actions for Line, block 3")!, "Move up");
    expect(order()).toEqual(["note:Sleep cooler this December", "line", "note:Our covers are back"]);

    const undo = () => press("z", { ctrl: true }, document.body);
    const redo = () => press("z", { ctrl: true, shift: true }, document.body);
    undo();
    expect(order()).toEqual(["note:Sleep cooler this December", "note:Our covers are back", "line"]);
    undo();
    expect(order()).toEqual(["note:Sleep cooler this December", "note:Our covers are back"]);
    undo();
    expect(order()).toEqual(["note:Sleep cooler this", "note:Our covers are back"]);
    undo();
    expect(order()).toEqual(["note:Sleep cooler", "note:Our covers are back"]);
    redo();
    redo();
    expect(order()).toEqual(["note:Sleep cooler this December", "note:Our covers are back"]);
    press("y", { ctrl: true }, document.body);
    expect(order()).toEqual(["note:Sleep cooler this December", "note:Our covers are back", "line"]);
  });

  it("leaves keys pressed outside the editor alone", () => {
    mount(START);
    typeField(cards()[0].querySelector("input")!, "Changed");
    const outside = document.createElement("input");
    document.body.append(outside);
    press("z", { ctrl: true }, outside);
    expect(order()[0]).toBe("note:Changed");
  });
});

describe("read-only", () => {
  it("shows the blocks as they are: no grip, no menu, no +, no Add block", () => {
    mount(START, true);
    expect(cards()).toHaveLength(2);
    expect(document.querySelector('[aria-label^="Drag "]')).toBeNull();
    expect(byLabel("Actions for Note, block 1")).toBeNull();
    expect(byLabel("Add a block before Note, block 2")).toBeNull();
    expect(byLabel("Add block")).toBeNull();
    expect(cards()[0].querySelector("input")!.disabled).toBe(true);
  });
});
