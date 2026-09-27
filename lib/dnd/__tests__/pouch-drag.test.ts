import { describe, expect, it } from "vitest";

import { dropIndex, dropTargetFromElement, layerChoices, planPouchDrop, pouchDropDestination, resolveLayerChoice } from "@/lib/dnd/pouch-drag";

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

describe("planPouchDrop", () => {
  const center = { kind: "cell", section: "center", subSection: "middle" } as const;
  const own = { kind: "cell", section: "left", subSection: "front" } as const;

  it("drops straight into a side-by-side cell, at the drop's position when given", () => {
    expect(planPouchDrop(source, center, { layerCount: 1 })).toEqual({ kind: "move", to: { cell: { section: "center", subSection: "middle" }, layer: null } });
    expect(planPouchDrop(source, center, { layerCount: 0, index: 1 })).toEqual({
      kind: "move",
      to: { cell: { section: "center", subSection: "middle" }, layer: null, index: 1 },
    });
  });

  it("asks for a Layer when the cell is stacked, its own cell included", () => {
    expect(planPouchDrop(source, center, { layerCount: 2, index: 0 })).toEqual({ kind: "chooseLayer", cell: { section: "center", subSection: "middle" } });
    expect(planPouchDrop(source, own, { layerCount: 3 })).toEqual({ kind: "chooseLayer", cell: { section: "left", subSection: "front" } });
  });

  it("reorders within its own side-by-side Layer, and is null back at its own position", () => {
    expect(planPouchDrop(source, own, { layerCount: 1, index: 2, sourceIndex: 0 })).toEqual({
      kind: "move",
      to: { cell: { section: "left", subSection: "front" }, layer: 0, index: 2 },
    });
    expect(planPouchDrop(source, own, { layerCount: 1, index: 0, sourceIndex: 0 })).toBeNull();
    expect(planPouchDrop(source, own, { layerCount: 1 })).toBeNull();
  });

  it("keeps the row target and the cancel of pouchDropDestination", () => {
    expect(planPouchDrop(source, { kind: "layer", section: "right", subSection: "back", depth: 1 }, { layerCount: 2 })).toEqual({
      kind: "move",
      to: { cell: { section: "right", subSection: "back" }, layer: 1 },
    });
    expect(planPouchDrop(source, center, { layerCount: 1 }, true)).toBeNull();
    expect(planPouchDrop(source, null, { layerCount: 1 })).toBeNull();
  });
});

describe("layerChoices / resolveLayerChoice", () => {
  const caps = { maxLayers: 5, maxPerLayer: 3 };

  it("lists the Layers top → deep, own and full ones disabled, then a new Layer", () => {
    expect(layerChoices([2, 3], null, caps)).toEqual([
      { id: "0", label: "Top layer", disabled: false },
      { id: "1", label: "Layer 2", disabled: true },
      { id: "new", label: "New layer", disabled: false },
    ]);
    expect(layerChoices([1, 1], 0, caps).map((c) => c.disabled)).toEqual([true, false, false]);
  });

  it("offers no new Layer at the cap, or to a pouch alone at the bottom", () => {
    expect(layerChoices([1, 1, 1, 1, 1], null, caps).some((c) => c.id === "new")).toBe(false);
    expect(layerChoices([2, 1], 1, caps).some((c) => c.id === "new")).toBe(false);
  });

  it("shifts deeper picks up by one when the pouch's own Layer closes behind it", () => {
    expect(resolveLayerChoice("2", [1, 2, 2], 0)).toBe(1);
    expect(resolveLayerChoice("new", [1, 2, 2], 0)).toBe(2);
    expect(resolveLayerChoice("2", [2, 2, 2], 0)).toBe(2);
    expect(resolveLayerChoice("new", [2, 2], null)).toBe(2);
    expect(resolveLayerChoice("0", [2, 1, 2], 1)).toBe(0);
  });
});

describe("dropIndex", () => {
  const row = [
    { cx: 10, cy: 10, h: 10 },
    { cx: 30, cy: 10, h: 10 },
    { cx: 10, cy: 30, h: 10 },
  ];
  it("counts the pouches before the pointer in reading order", () => {
    expect(dropIndex(row, 0, 10)).toBe(0);
    expect(dropIndex(row, 20, 10)).toBe(1);
    expect(dropIndex(row, 40, 10)).toBe(2);
    expect(dropIndex(row, 0, 30)).toBe(2);
    expect(dropIndex(row, 20, 30)).toBe(3);
    expect(dropIndex([], 5, 5)).toBe(0);
  });
});
