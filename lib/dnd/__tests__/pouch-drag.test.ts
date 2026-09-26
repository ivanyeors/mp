import { describe, expect, it } from "vitest";

import { dropTargetFromElement, pouchDropDestination } from "@/lib/dnd/pouch-drag";

const source = { section: "left", subSection: "front", slot: 2, depth: 0 } as const;

/** A minimal element: `closest` walks a chain of tagged ancestors. */
type FakeEl = { getAttribute: (name: string) => string | null; closest: (selector: string) => FakeEl | null; parent: FakeEl | null };
function el(attrs: Record<string, string>, parent: FakeEl | null = null): FakeEl {
  const node: FakeEl = {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    closest(selector) {
      const attr = selector.slice(1, -1);
      let cur: FakeEl | null = node;
      while (cur) {
        if (cur.getAttribute(attr) !== null) return cur;
        cur = cur.parent;
      }
      return null;
    },
    parent,
  };
  return node;
}
const asElement = (n: FakeEl | null) => n as unknown as Element | null;

describe("pouchDropDestination", () => {
  it("maps a drop on a cell to that cell's topmost Layer with room", () => {
    expect(pouchDropDestination(source, { kind: "cell", section: "center", subSection: "middle" })).toEqual({
      cell: { section: "center", subSection: "middle" },
      layer: null,
    });
    // Another cell of the same Section too — the drop can cross Sections or not.
    expect(pouchDropDestination(source, { kind: "cell", section: "left", subSection: "back" })).toEqual({
      cell: { section: "left", subSection: "back" },
      layer: null,
    });
  });

  it("maps a drop on a layer row to that Layer exactly, its own cell included", () => {
    expect(pouchDropDestination(source, { kind: "layer", section: "right", subSection: "back", depth: 2 })).toEqual({
      cell: { section: "right", subSection: "back" },
      layer: 2,
    });
    expect(pouchDropDestination(source, { kind: "layer", section: "left", subSection: "front", depth: 1 })).toEqual({
      cell: { section: "left", subSection: "front" },
      layer: 1,
    });
  });

  it("is null for a cancel, a drop nowhere, or a drop back on itself", () => {
    expect(pouchDropDestination(source, { kind: "cell", section: "center", subSection: "middle" }, true)).toBeNull();
    expect(pouchDropDestination(source, null)).toBeNull();
    expect(pouchDropDestination(source, { kind: "cell", section: "left", subSection: "front" })).toBeNull();
    expect(pouchDropDestination(source, { kind: "layer", section: "left", subSection: "front", depth: 0 })).toBeNull();
  });
});

describe("dropTargetFromElement", () => {
  it("reads a cell or a layer row from the tagged element or its ancestor", () => {
    expect(dropTargetFromElement(asElement(el({ "data-drop-cell": "center/middle" })))).toEqual({ kind: "cell", section: "center", subSection: "middle" });
    const row = el({ "data-drop-cell": "left/back", "data-drop-layer": "1" });
    expect(dropTargetFromElement(asElement(el({}, row)))).toEqual({ kind: "layer", section: "left", subSection: "back", depth: 1 });
  });

  it("is null off any target or on a malformed tag", () => {
    expect(dropTargetFromElement(null)).toBeNull();
    expect(dropTargetFromElement(asElement(el({})))).toBeNull();
    expect(dropTargetFromElement(asElement(el({ "data-drop-cell": "nowhere/middle" })))).toBeNull();
    expect(dropTargetFromElement(asElement(el({ "data-drop-cell": "left/front", "data-drop-layer": "x" })))).toEqual({ kind: "cell", section: "left", subSection: "front" });
  });
});
