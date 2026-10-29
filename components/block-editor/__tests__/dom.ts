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
