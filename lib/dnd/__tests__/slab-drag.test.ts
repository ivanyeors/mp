import { describe, expect, it } from "vitest";

import { cellLayers } from "@/lib/configurator/staff-assist";
import { applySlabDrop, cellBands, describeSlabTarget, previewSlabDrop, slabTargetAt, slabTargetKey, stepSlabLayer, type SlabDropTarget } from "@/lib/dnd/slab-drag";
import type { PillowPlacement, Section, SubSection } from "@/lib/spatial-fillings/core";
import { alongSlabs } from "@/lib/spatial-fillings/cross-section";
import { GENERIC_POUCH, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";

const at = (section: Section, subSection: SubSection, slot: number, itemId: number, row?: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId,
  ...(row === undefined ? {} : { row }),
});
const front = { section: "center", subSection: "front" } as const;
const middle = { section: "center", subSection: "middle" } as const;
/** Items by layer, top → deep, as `[itemId…]` per Layer. */
const stack = (placements: PillowPlacement[], cell: { section: Section; subSection: SubSection }) =>
  cellLayers(placements, cell).map((l) => l.map((p) => p.itemId));
const ok = (r: ReturnType<typeof applySlabDrop>) => {
  if (!r || !r.ok) throw new Error(`expected a move, got ${JSON.stringify(r)}`);
  return r;
};

describe("slabTargetAt", () => {
  const bands = [
    { depth: 0, lowMm: 60, highMm: 100 },
    { depth: 1, lowMm: 20, highMm: 60 },
    { depth: 2, lowMm: 0, highMm: 20 },
  ];

  it("an empty column is the cell itself", () => {
    expect(slabTargetAt(front, [], 30)).toEqual({ kind: "cell", ...front });
  });

  it("over the top is a new top Layer, under the deepest a new bottom one", () => {
    expect(slabTargetAt(front, bands, 140)).toEqual({ kind: "gap", ...front, gap: 0 });
    expect(slabTargetAt(front, bands.slice(0, 2), 5)).toEqual({ kind: "gap", ...front, gap: 2 });
  });

  it("a band's middle joins that Layer; its edges insert a new one beside it", () => {
    expect(slabTargetAt(front, bands, 80)).toEqual({ kind: "layer", ...front, depth: 0 });
    expect(slabTargetAt(front, bands, 98)).toEqual({ kind: "gap", ...front, gap: 0 });
    expect(slabTargetAt(front, bands, 62)).toEqual({ kind: "gap", ...front, gap: 1 });
    expect(slabTargetAt(front, bands, 58)).toEqual({ kind: "gap", ...front, gap: 1 });
    expect(slabTargetAt(front, bands, 40)).toEqual({ kind: "layer", ...front, depth: 1 });
    expect(slabTargetAt(front, bands, 2)).toEqual({ kind: "gap", ...front, gap: 3 });
  });
});

describe("cellBands", () => {
  it("reads one band per Layer of the cell, from the drawn slabs, ignoring other cells", () => {
    const placements = [at("center", "front", 1, 1, 0), at("center", "front", 2, 1, 1), at("center", "middle", 1, 1)];
    const fit = fitPillow(placements, { size: "M" });
    const bands = cellBands(alongSlabs(fit, "center"), front);
    expect(bands.map((b) => b.depth)).toEqual([0, 1]);
    expect(bands[0].lowMm).toBeCloseTo(bands[1].highMm, 5);
    expect(bands[1].lowMm).toBe(0);
  });
});

describe("applySlabDrop", () => {
  const two = [at("center", "front", 1, 1, 0), at("center", "front", 2, 2, 1), at("center", "middle", 1, 3)];

  it("into another column: its topmost Layer with room, the source cell closing up", () => {
    const r = ok(applySlabDrop(two, { ...front, slot: 1 }, { kind: "cell", ...middle }));
    expect(stack(r.placements, middle)).toEqual([[3, 1]]);
    expect(stack(r.placements, front)).toEqual([[2]]);
    expect(r.ref).toEqual({ ...middle, slot: 2 });
  });

  it("between two Layers of another cell: a new Layer exactly there", () => {
    const placements = [...two, at("center", "middle", 2, 4, 1)];
    const r = ok(applySlabDrop(placements, { ...front, slot: 1 }, { kind: "gap", ...middle, gap: 1 }));
    expect(stack(r.placements, middle)).toEqual([[3], [1], [4]]);
    const top = ok(applySlabDrop(placements, { ...front, slot: 1 }, { kind: "gap", ...middle, gap: 0 }));
    expect(stack(top.placements, middle)).toEqual([[1], [3], [4]]);
  });

  it("onto a Layer: side by side in it", () => {
    const r = ok(applySlabDrop(two, { ...front, slot: 2 }, { kind: "layer", ...middle, depth: 0 }));
    expect(stack(r.placements, middle)).toEqual([[3, 2]]);
  });

  it("within its own column: Layers reorder, and its own place is a no-op", () => {
    const three = [at("center", "front", 1, 1, 0), at("center", "front", 2, 2, 1), at("center", "front", 3, 3, 2)];
    expect(applySlabDrop(three, { ...front, slot: 1 }, { kind: "layer", ...front, depth: 0 })).toBeNull();
    expect(applySlabDrop(three, { ...front, slot: 1 }, { kind: "gap", ...front, gap: 0 })).toBeNull();
    expect(applySlabDrop(three, { ...front, slot: 1 }, { kind: "gap", ...front, gap: 1 })).toBeNull();
    expect(applySlabDrop(three, { ...front, slot: 1 }, { kind: "cell", ...front })).toBeNull();
    // Top under the middle one: between Layers 2 and 3.
    expect(stack(ok(applySlabDrop(three, { ...front, slot: 1 }, { kind: "gap", ...front, gap: 2 })).placements, front)).toEqual([[2], [1], [3]]);
    // The deepest to the top.
    expect(stack(ok(applySlabDrop(three, { ...front, slot: 3 }, { kind: "gap", ...front, gap: 0 })).placements, front)).toEqual([[3], [1], [2]]);
    // Onto the deepest Layer, side by side: its own Layer closes.
    expect(stack(ok(applySlabDrop(three, { ...front, slot: 1 }, { kind: "layer", ...front, depth: 2 })).placements, front)).toEqual([[2], [1, 3]]);
  });

  it("splits a piece out of a shared Layer into a new one above or below", () => {
    const shared = [at("center", "front", 1, 1, 0), at("center", "front", 2, 2, 0)];
    expect(stack(ok(applySlabDrop(shared, { ...front, slot: 2 }, { kind: "gap", ...front, gap: 0 })).placements, front)).toEqual([[2], [1]]);
    expect(stack(ok(applySlabDrop(shared, { ...front, slot: 2 }, { kind: "gap", ...front, gap: 1 })).placements, front)).toEqual([[1], [2]]);
  });

  it("to another Section, and refuses past the Layer cap with the add's message", () => {
    const r = ok(applySlabDrop(two, { ...front, slot: 1 }, { kind: "cell", section: "left", subSection: "front" }));
    expect(stack(r.placements, { section: "left", subSection: "front" })).toEqual([[1]]);
    const full = [0, 1, 2, 3, 4].map((row) => at("center", "middle", row + 1, 9, row));
    const refused = applySlabDrop([...full, at("center", "front", 1, 1)], { ...front, slot: 1 }, { kind: "gap", ...middle, gap: 2 });
    expect(refused).toEqual({ ok: false, error: "Max 5 layers per cell" });
  });

  it("previews the drop with the fit it would leave, from the same move", () => {
    const dims = new Map<number, ResolvedDims>([[1, { key: "k", kind: "pouch", source: "configured", measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, thicknessMm: 50 } }]]);
    const placements = [at("center", "front", 1, 1), at("center", "middle", 1, 1), at("center", "back", 1, 1)];
    const target: SlabDropTarget = { kind: "gap", ...middle, gap: 0 };
    const { result, fit } = previewSlabDrop(placements, { ...front, slot: 1 }, target, { size: "M", dims });
    expect(result?.ok).toBe(true);
    expect(fit?.sections.center.columns.middle?.planes).toHaveLength(2);
    expect(previewSlabDrop(placements, { ...front, slot: 1 }, { kind: "cell", ...front }, { size: "M" })).toEqual({ result: null, fit: null });
  });
});

describe("stepSlabLayer", () => {
  const three = [at("center", "front", 1, 1, 0), at("center", "front", 2, 2, 1), at("center", "front", 3, 3, 2)];

  it("steps a lone piece past its neighbour Layer — never into it — and stops at the ends", () => {
    expect(stack(ok(stepSlabLayer(three, { ...front, slot: 1 }, 1)).placements, front)).toEqual([[2], [1], [3]]);
    expect(stack(ok(stepSlabLayer(three, { ...front, slot: 3 }, -1)).placements, front)).toEqual([[1], [3], [2]]);
    expect(stepSlabLayer(three, { ...front, slot: 1 }, -1)).toBeNull();
    expect(stepSlabLayer(three, { ...front, slot: 3 }, 1)).toBeNull();
  });

  it("splits a piece out of a shared Layer, above or below it", () => {
    const shared = [at("center", "front", 1, 1, 0), at("center", "front", 2, 2, 0)];
    expect(stack(ok(stepSlabLayer(shared, { ...front, slot: 2 }, -1)).placements, front)).toEqual([[2], [1]]);
    expect(stack(ok(stepSlabLayer(shared, { ...front, slot: 2 }, 1)).placements, front)).toEqual([[1], [2]]);
  });
});

describe("describeSlabTarget", () => {
  it("says where the drop lands in plain words", () => {
    expect(describeSlabTarget({ kind: "gap", ...middle, gap: 0 }, 2)).toBe("center middle, new top layer");
    expect(describeSlabTarget({ kind: "gap", ...middle, gap: 2 }, 2)).toBe("center middle, new bottom layer");
    expect(describeSlabTarget({ kind: "gap", ...middle, gap: 1 }, 2)).toBe("center middle, new layer between 1 and 2");
    expect(describeSlabTarget({ kind: "layer", ...middle, depth: 1 }, 2)).toBe("center middle, layer 2 — side by side");
    expect(describeSlabTarget({ kind: "cell", ...middle }, 0)).toBe("into the empty center middle");
    expect(describeSlabTarget({ kind: "cell", section: "left", subSection: "back" }, 1, "center")).toBe("to the left Section, back");
    expect(slabTargetKey({ kind: "gap", ...middle, gap: 1 })).not.toBe(slabTargetKey({ kind: "layer", ...middle, depth: 1 }));
  });
});
