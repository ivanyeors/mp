// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { docFromValue, valueFromDoc, type DocNode, type RichTextValue } from "../rich-text-doc";
import { richTextExtensions } from "../rich-text-schema";

const BULLETS: RichTextValue = [
  { kind: "p", runs: [{ text: "Why customers love it" }] },
  { kind: "bullets", items: [[{ text: "Cool cover" }], [{ text: "Washable" }], [{ text: "Firm" }]] },
];

const editors: Editor[] = [];
function editor() {
  const element = document.createElement("div");
  document.body.append(element);
  const e = new Editor({ element, extensions: richTextExtensions({ marks: { bold: true, bullets: true }, variables: [] }), content: docFromValue(BULLETS) });
  editors.push(e);
  return e;
}
const read = (e: Editor) => valueFromDoc(e.getJSON() as DocNode, []);

function cursorInBullet(e: Editor, n: number) {
  let seen = 0;
  let at = -1;
  e.state.doc.descendants((node, pos) => {
    if (node.type.name === "listItem" && seen++ === n) at = pos + 2;
    return at < 0;
  });
  e.commands.setTextSelection(at);
  expect(e.state.selection.$from.parent.textContent).toBe(["Cool cover", "Washable", "Firm"][n]);
}

function press(e: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  let handled = false;
  e.view.someProp("handleKeyDown", (f) => (handled = f(e.view, event) === true));
  return handled;
}

afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
});

describe("Tab in a bullet of a campaign or email-template rich-text field", () => {
  it.each([0, 1, 2])("bullet %i: Tab does not throw, is left to the browser so focus moves on, and leaves the text as it was", (n) => {
    const e = editor();
    cursorInBullet(e, n);
    const before = e.getJSON();
    expect(() => press(e, "Tab")).not.toThrow();
    expect(press(e, "Tab")).toBe(false);
    const real = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    e.view.dom.dispatchEvent(real);
    expect(real.defaultPrevented).toBe(false);
    expect(e.getJSON()).toEqual(before);
    expect(read(e)).toEqual(BULLETS);
  });

  it("the Tab keyboard shortcut command does not throw in the second bullet", () => {
    const e = editor();
    cursorInBullet(e, 1);
    expect(() => e.commands.keyboardShortcut("Tab")).not.toThrow();
    expect(read(e)).toEqual(BULLETS);
  });

  it("Shift-Tab still takes the line out of the list, as it did before", () => {
    const e = editor();
    cursorInBullet(e, 2);
    expect(() => press(e, "Tab", true)).not.toThrow();
    expect(read(e)).toEqual([BULLETS[0], { kind: "bullets", items: [[{ text: "Cool cover" }], [{ text: "Washable" }]] }, { kind: "p", runs: [{ text: "Firm" }] }]);
  });
});
