// @vitest-environment jsdom
import { press, richTextIn, settle, typeField, typeInto, until } from "./dom";
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichText, type RichTextValue } from "../rich-text";
import { useEditorHistory, useHistoryKeys } from "../use-editor-history";

/**
 * The shared text input (PRD-campaign-email-editor slice 04) inside a page's
 * one history: ⌘Z undoes the page, except in a field the history does not
 * hold, such as the toolbar's link address, which keeps the browser's own.
 */

const words = (v: RichTextValue) => v.map((p) => (p.kind === "p" ? p.runs.map((r) => ("text" in r ? r.text : "")).join("") : "")).join("\n");

let seen: RichTextValue = [];
function Harness({ initial }: { initial: RichTextValue }) {
  const history = useEditorHistory<RichTextValue>(initial);
  const area = useRef<HTMLDivElement>(null);
  useHistoryKeys(history, { within: area });
  useEffect(() => {
    seen = history.value;
  });
  return (
    <div ref={area}>
      <RichText
        aria-label="Text"
        value={history.value}
        marks={{ bold: true, link: (url) => url.startsWith("https://") }}
        onChange={(next, how) => history.set(next, { burst: how.paste ? undefined : "text" })}
      />
    </div>
  );
}

let root: Root | null = null;
function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(20);
  document.body.innerHTML = "";
});

describe("RichText", () => {
  it("leaves the link address its own undo: ⌘Z there takes back the address, not the words", async () => {
    mount(<Harness initial={[{ kind: "p", runs: [{ text: "Read the care guide" }] }]} />);
    const editor = await richTextIn(document.body);
    act(() => void editor.commands.focus("end"));
    typeInto(editor, " today");
    expect(words(seen)).toBe("Read the care guide today");

    act(() => void editor.commands.setTextSelection({ from: 10, to: 20 }));
    const link = await until(() => document.querySelector<HTMLButtonElement>('[aria-label="Link"]'));
    await act(async () => link.click());
    const address = await until(() => document.querySelector<HTMLInputElement>('[aria-label="Link address"]'));
    typeField(address, "https://mpillow.com/care");
    const undo = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void address.dispatchEvent(undo));
    expect(undo.defaultPrevented).toBe(false);
    expect(words(seen)).toBe("Read the care guide today");
    press("z", { ctrl: true }, editor.view.dom);
    expect(words(seen)).toBe("Read the care guide");
  });

  it("shows a single line as one line before the editor loads and while read-only", async () => {
    const value: RichTextValue = [{ kind: "p", runs: [{ text: "Sleep cooler this December" }] }];
    const box = () => document.querySelector<HTMLElement>('[role="textbox"]')!;
    mount(<RichText aria-label="Subject" singleLine readOnly value={value} onChange={() => undefined} />);
    expect(box().getAttribute("aria-multiline")).toBe("false");
    expect(box().className).toContain("min-h-9");
    expect(box().className).not.toContain("min-h-24");
    act(() => root!.unmount());

    // On the server and until TipTap loads, the words as they read stand in for it, at the same height.
    const host = document.createElement("div");
    host.innerHTML = renderToString(<RichText aria-label="Subject" singleLine value={value} onChange={() => undefined} />);
    const view = host.querySelector<HTMLElement>('[role="textbox"]')!;
    expect(view.getAttribute("aria-multiline")).toBe("false");
    expect(view.className).toContain("min-h-9");

    mount(<RichText aria-label="Subject" singleLine value={value} onChange={() => undefined} />);
    const editor = await richTextIn(document.body);
    expect(editor.view.dom.getAttribute("aria-multiline")).toBe("false");
  });

  it("keeps the { list inside a phone's screen when the caret is near its right edge", async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    // The caret's spot, as the browser measures it: 340px in on a 375px screen.
    const at = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(340, 80, 8, 20));
    // With a caret that has a place, ProseMirror scrolls it into view, which jsdom cannot do.
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    try {
      mount(<RichText aria-label="Subject" singleLine value={[]} variables={[{ key: "order_number", label: "Order number" }]} onChange={() => undefined} />);
      const editor = await richTextIn(document.body);
      act(() => void editor.commands.focus());
      typeInto(editor, "Order {");
      const list = await until(() => document.querySelector<HTMLElement>('[role="listbox"]'));
      expect(list.style.left).toBe(`${375 - 256 - 8}px`);
      expect(list.style.top).toBe("104px");
    } finally {
      at.mockRestore();
      scroll.mockRestore();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });
});
