/**
 * What jsdom leaves out and the block editor's parts read, for component
 * tests under `// @vitest-environment jsdom`. Import it before the parts:
 * dnd-kit reads ResizeObserver when it loads, and ProseMirror measures ranges
 * when it focuses or pastes.
 */
import { act } from "react";
import type { Editor } from "@tiptap/core";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A desktop-width screen whose sizes never change.
window.matchMedia ??= ((media: string) => ({
  matches: false,
  media,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.ClipboardEvent ??= class extends Event {
  clipboardData = null;
} as unknown as typeof ClipboardEvent;
globalThis.PointerEvent ??= class extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
} as unknown as typeof PointerEvent;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
document.elementFromPoint ??= () => null;
Element.prototype.scrollIntoView ??= () => undefined;

/** Past timers and lazy loads, inside act. */
export const settle = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

/** Waits until `find` finds something, settling between tries. */
export async function until<T>(find: () => T | null | undefined, tries = 50): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const found = find();
    if (found) return found;
    await settle(20);
  }
  throw new Error("Never appeared.");
}

/** The TipTap editor behind a `RichText` inside `el`, once it has loaded. */
export async function richTextIn(el: ParentNode): Promise<Editor> {
  const dom = await until(() => el.querySelector<HTMLElement & { editor?: Editor }>(".ProseMirror"));
  return until(() => dom.editor);
}

/** Types into the editor a character at a time, as the keyboard does: input rules and `/` run. */
export function typeInto(editor: Editor, text: string) {
  act(() => {
    const view = editor.view;
    for (const ch of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  });
}

/** The TipTap editor of the `RichText` given `id`, once it has loaded. */
export async function richTextById(id: string): Promise<Editor> {
  return until(() => (document.getElementById(id) as (HTMLElement & { editor?: Editor }) | null)?.editor);
}

/** Replaces all of a `RichText`'s words (`id`), typed as the keyboard does: input rules and `{` run. */
export async function retype(id: string, text: string) {
  const editor = await richTextById(id);
  // The words selected, as a text selection: typing then carries on after each letter.
  act(() => void editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 }));
  if (text) typeInto(editor, text);
  else act(() => void editor.commands.deleteSelection());
}

/** A `RichText`'s words as they read, by its id, loaded or not: a Variable as its label. */
export const wordsOf = (id: string) => document.getElementById(id)?.textContent ?? "";

/** A `RichText`'s placeholder, by its id, loaded or not. */
export function placeholderOf(id: string): string | null {
  const el = document.getElementById(id);
  return el?.getAttribute("aria-placeholder") ?? el?.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") ?? null;
}

/**
 * Drops `dataTransfer` into an editor at `pos`, as a drag from outside it
 * does: ProseMirror's own drop handling reads it. jsdom has no layout, so the
 * spot under the pointer is `pos`.
 */
export function dropInto(editor: Editor, dataTransfer: Pick<DataTransfer, "getData" | "types">, pos: number) {
  act(() => {
    editor.view.posAtCoords = () => ({ pos, inside: -1 });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(drop, { dataTransfer, clientX: 0, clientY: 0 });
    editor.view.dom.dispatchEvent(drop);
  });
}

/** A drag's data, as a `dragstart` handler fills it and a drop reads it. */
export function dragData(): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    get types() {
      return [...data.keys()];
    },
    effectAllowed: "all",
    dropEffect: "none",
  } as unknown as DataTransfer;
}

/** Starts a drag of `el`, filling `dataTransfer` as the browser hands it to `dragstart`. */
export function dragStart(el: HTMLElement, dataTransfer: DataTransfer) {
  act(() => {
    const start = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.assign(start, { dataTransfer });
    el.dispatchEvent(start);
  });
}

/** Pastes HTML into the editor through ProseMirror's own clipboard parsing. */
export function pasteInto(editor: Editor, html: string) {
  act(() => {
    editor.view.pasteHTML(html);
  });
}

/** Sets a native field's value as typing does, so React sees it. */
export function typeField(el: HTMLInputElement | HTMLTextAreaElement, value: string, inputType = "insertText") {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
  });
}

/** A key pressed where focus is (or on `target`). */
export function press(key: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}, target: EventTarget = document.activeElement ?? document.body) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: mods.ctrl, metaKey: mods.meta, shiftKey: mods.shift, bubbles: true, cancelable: true }));
  });
}

/**
 * Opens a Radix menu from its trigger, as a keyboard user does, and chooses
 * `label`. A menu that just closed hands focus back on a timer first, as it
 * does in a browser, so that runs before the next one opens.
 */
export async function choose(trigger: HTMLElement, label: string | RegExp) {
  await settle();
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const matches = (el: HTMLElement) => (typeof label === "string" ? el.textContent?.trim().startsWith(label) : label.test(el.textContent ?? ""));
  const item = await until(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(matches), 10).catch(() => null);
  if (!item) throw new Error(`No menu item ${label}`);
  await act(async () => item.click());
  await settle();
}

export const click = async (el: HTMLElement) => {
  await act(async () => el.click());
};

/** A pointer pressed on `el`, as a click starts: what selects a block's card. */
export const pointAt = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
};

export const byLabel = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("button, [role='button']")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  ) ?? null;
