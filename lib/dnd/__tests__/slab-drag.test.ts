import { describe, expect, it } from "vitest";

import { cellLayers } from "@/lib/configurator/staff-assist";
import { addAtSlabTarget, alongExtent, applySlabDrop, cellBands, describeSlabTarget, homeCentreMm, nudgeSlab, placeAlongAt, placeSlabDrop, previewSlabDrop, slabTargetAt, slabTargetKey, snapAlongCentre, stepSlabLayer, type SlabDropTarget } from "@/lib/dnd/slab-drag";
import type { PillowPlacement, Section, SubSection } from "@/lib/spatial-fillings/core";
import { alongSlabs } from "@/lib/spatial-fillings/cross-section";
import { GENERIC_POUCH, PILLOW_DIMENSIONS, resolveDims, sizeFactors, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { settlePillow } from "@/lib/spatial-fillings/settle";

const at = (section: Section, subSection: SubSection, slot: number, itemId: number, row?: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId,
  ...(row === undefined ? {} : { row }),
});
const front = { section: "center", subSection: "front" } as const;
const middle = { section: "center", subSection: "middle" } as const;
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
    expect(stack(ok(applySlabDrop(three, { ...front, slot: 1 }, { kind: "gap", ...front, gap: 2 })).placements, front)).toEqual([[2], [1], [3]]);
    expect(stack(ok(applySlabDrop(three, { ...front, slot: 3 }, { kind: "gap", ...front, gap: 0 })).placements, front)).toEqual([[3], [1], [2]]);
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

describe("addAtSlabTarget: a tap on the cut adds where it names", () => {
  const added = (r: ReturnType<typeof addAtSlabTarget>) => {
    if (!r.ok) throw new Error(`expected an add, got ${r.error}`);
    return r.placements;
  };
  const two = [at("center", "middle", 1, 3, 0), at("center", "middle", 2, 4, 1)];

  it("an empty column: the cell's first piece", () => {
    expect(stack(added(addAtSlabTarget(two, { kind: "cell", ...front }, 9)), front)).toEqual([[9]]);
  });

  it("above the stack, between Layers and under it: a new Layer exactly there", () => {
    expect(stack(added(addAtSlabTarget(two, { kind: "gap", ...middle, gap: 0 }, 9)), middle)).toEqual([[9], [3], [4]]);
    expect(stack(added(addAtSlabTarget(two, { kind: "gap", ...middle, gap: 1 }, 9)), middle)).toEqual([[3], [9], [4]]);
    expect(stack(added(addAtSlabTarget(two, { kind: "gap", ...middle, gap: 2 }, 9)), middle)).toEqual([[3], [4], [9]]);
  });

  it("a Layer's middle: beside what is in it", () => {
    expect(stack(added(addAtSlabTarget(two, { kind: "layer", ...middle, depth: 1 }, 9)), middle)).toEqual([[3], [4, 9]]);
  });

  it("a cell at its Layer cap still takes it, on its top Layer with room", () => {
    const five = [1, 2, 3, 4, 5].map((item, row) => at("center", "middle", row + 1, item, row));
    expect(stack(added(addAtSlabTarget(five, { kind: "gap", ...middle, gap: 0 }, 9)), middle)).toEqual([[1, 9], [2], [3], [4], [5]]);
  });

  it("leaves every other cell as it was", () => {
    const next = added(addAtSlabTarget([...two, at("left", "front", 1, 7)], { kind: "gap", ...middle, gap: 0 }, 9));
    expect(next.filter((p) => p.section === "left")).toEqual([at("left", "front", 1, 7)]);
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

describe("placing a pouch exactly (the cut's fine nudge)", () => {
  const ITEMS: Record<number, { name: string; category?: string }> = {
    1: { name: "6D (S)" },
    4: { name: "Cervical Neck Support (M)", category: "accessories" },
  };
  const dims = new Map<number, ResolvedDims>(Object.entries(ITEMS).map(([id, it]) => [Number(id), resolveDims({ name: it.name, category: it.category ?? "filling" })]));
  const ctxAt = (size: PillowSize) => ({ size, dims });
  const drawnOf = (placements: PillowPlacement[], key: string, size: PillowSize = "M") => {
    const fit = fitPillow(placements, ctxAt(size));
    const p = fit.sections.center.pieces.find((q) => q.key === key)!;
    return { fit, centre: (p.startMm + p.endMm) / 2, cell: fit.settle.cellLengthMm, p };
  };
  const mix = [at("center", "front", 1, 1, 0), at("center", "middle", 1, 1, 0), at("center", "middle", 2, 4, 1), at("center", "back", 1, 1, 0), at("center", "back", 2, 1, 1)];
  const roll = { section: "center", subSection: "middle", slot: 2 } as const;

  it("drops a pouch centred where it was let go, in its own Layer, to the millimetre", () => {
    const before = drawnOf(mix, "center/middle/2");
    for (const mm of [15, -15, 4]) {
      const r = placeSlabDrop(mix, roll, { kind: "layer", ...middle, depth: 1 }, before.centre + mm, ctxAt("M"));
      if (!r?.ok) throw new Error("expected a placement");
      expect(r.within).toBe(true);
      expect(r.placements.find((p) => p.slot === 2 && p.subSection === "middle")!.offsetYMm).toBe(mm);
      expect(drawnOf(r.placements, "center/middle/2").centre - before.centre).toBeCloseTo(mm, 0);
    }
  });

  it("never stands a pouch in another column: dropped past its room, it stops at the column's edge", () => {
    const before = drawnOf(mix, "center/middle/2");
    const r = placeSlabDrop(mix, roll, { kind: "layer", ...middle, depth: 1 }, before.centre + 200, ctxAt("M"));
    if (!r?.ok) throw new Error("expected a placement");
    const after = drawnOf(r.placements, "center/middle/2");
    expect(after.p.endMm).toBeCloseTo(2 * after.cell, 0);
    const full = drawnOf(mix, "center/middle/1");
    expect(placeSlabDrop(mix, { ...middle, slot: 1 }, { kind: "layer", ...middle, depth: 0 }, full.centre + 30, ctxAt("M"))).toBeNull();
    expect(nudgeSlab(mix, { ...middle, slot: 1 }, 5, ctxAt("M"))).toBeNull();
  });

  it("dropped in another column, it moves there and lands where it was let go", () => {
    const open = [at("center", "front", 1, 1, 0), at("center", "middle", 1, 4, 0)];
    const before = drawnOf(open, "center/middle/1");
    const r = placeSlabDrop(open, { ...middle, slot: 1 }, { kind: "cell", section: "center", subSection: "back" }, 2.5 * before.cell - 10, ctxAt("M"));
    if (!r?.ok) throw new Error("expected a move");
    expect(r.within).toBe(false);
    expect(r.ref.subSection).toBe("back");
    expect(drawnOf(r.placements, "center/back/1").centre).toBeCloseTo(2.5 * before.cell - 10, 0);
  });

  it("Alt + ← / → slides it 5 mm within its columns, and stores the offset in Size M millimetres", () => {
    for (const size of ["M", "XL"] as PillowSize[]) {
      const before = drawnOf(mix, "center/middle/2", size);
      const r = nudgeSlab(mix, roll, 5, ctxAt(size));
      if (!r?.ok) throw new Error("expected a nudge");
      expect(Math.abs(drawnOf(r.placements, "center/middle/2", size).centre - before.centre - 5)).toBeLessThan(1);
      const stored = r.placements.find((p) => p.slot === 2 && p.subSection === "middle")!.offsetYMm!;
      expect(Number.isInteger(stored)).toBe(true);
      expect(Math.abs(stored - 5 / sizeFactors(PILLOW_DIMENSIONS[size]).along)).toBeLessThan(1);
    }
    const edge = drawnOf(mix, "center/middle/2");
    const r = placeSlabDrop(mix, roll, { kind: "layer", ...middle, depth: 1 }, edge.centre - 200, ctxAt("M"));
    if (!r?.ok) throw new Error("expected a placement");
    expect(nudgeSlab(r.placements, roll, -5, ctxAt("M"))).toBeNull();
  });
});

describe("placeAlongAt: one front ↔ back writer for both views", () => {
  const stiff = new Map<number, ResolvedDims>([[1, { key: "test/stiff", kind: "pouch", dims: { ...GENERIC_POUCH, lengthMm: 80, thicknessMm: 45, minThicknessMm: 45 }, source: "fallback", measuredOn: null }]]);
  const ctx = { size: "M", dims: stiff };
  const extentOf = (placements: PillowPlacement[], ref: { section: Section; subSection: SubSection; slot: number }) =>
    alongExtent(settlePillow(placements, ctx), ref)!;

  it("slides into the empty column beside it, and stops at a neighbour of its own Layer", () => {
    const mix = [at("center", "middle", 1, 1, 0), at("center", "back", 1, 1, 0)];
    const here = extentOf(mix, { ...middle, slot: 1 });
    expect(here.reachStartMm).toBe(0);
    expect(here.reachEndMm).toBeCloseTo(2 * here.cellLengthMm, 0);
    const r = placeAlongAt(mix, { ...middle, slot: 1 }, here.startMm - 40, ctx);
    if (!r) throw new Error("expected a placement");
    expect(r.ref.subSection).toBe("middle");
    expect(extentOf(r.placements, r.ref).startMm).toBeCloseTo(here.startMm - 40, 0);
    const back = placeAlongAt(mix, { ...middle, slot: 1 }, here.startMm + 100, ctx);
    if (!back) throw new Error("expected a placement");
    expect(extentOf(back.placements, back.ref).endMm).toBeCloseTo(2 * here.cellLengthMm, 0);
  });

  it("moves to the free column its centre ends in, under anything lying there", () => {
    const mix = [at("center", "middle", 1, 1, 0), at("center", "back", 1, 1, 0)];
    const r = placeAlongAt(mix, { ...middle, slot: 1 }, 10, ctx);
    if (!r) throw new Error("expected a placement");
    expect(r.ref.subSection).toBe("front");
    expect(extentOf(r.placements, r.ref).startMm).toBeCloseTo(10, 0);
    const kept = placeAlongAt(mix, { ...middle, slot: 1 }, 10, ctx, true);
    expect(kept?.ref.subSection).toBe("middle");
    expect(extentOf(kept!.placements, kept!.ref).startMm).toBeCloseTo(10, 0);
  });

  it("changes nothing where it already stands, and keeps a whole, bounded offset", () => {
    const mix = [at("center", "middle", 1, 1, 0)];
    const here = extentOf(mix, { ...middle, slot: 1 });
    expect(placeAlongAt(mix, { ...middle, slot: 1 }, here.startMm, ctx)).toBeNull();
    const r = placeAlongAt(mix, { ...middle, slot: 1 }, here.startMm + 12.4, ctx)!;
    const off = r.placements[0].offsetYMm!;
    expect(Number.isInteger(off)).toBe(true);
    expect(off).toBe(12);
  });
});

describe("snapping a drop onto the places a hand aims for", () => {
  it("snapAlongCentre: home first, then a column's middle or edges, only within the radius", () => {
    expect(snapAlongCentre(162, 80, 110, 160, 4)).toEqual({ centreMm: 160, snap: "home" });
    expect(snapAlongCentre(57, 80, 110, 160, 4)).toEqual({ centreMm: 55, snap: "centred" });
    expect(snapAlongCentre(42, 80, 110, 160, 4)).toEqual({ centreMm: 40, snap: "front edge" });
    expect(snapAlongCentre(178, 80, 110, 160, 4)).toEqual({ centreMm: 180, snap: "back edge" });
    expect(snapAlongCentre(130, 80, 110, 160, 4)).toEqual({ centreMm: 130, snap: null });
    expect(snapAlongCentre(162, 80, 110, 160, 0)).toEqual({ centreMm: 162, snap: null });
  });

  it("a drop near home puts the pouch back home: its offset is cleared", () => {
    const stiff = new Map<number, ResolvedDims>([[1, { key: "test/stiff", kind: "pouch", dims: { ...GENERIC_POUCH, lengthMm: 80, thicknessMm: 45, minThicknessMm: 45 }, source: "fallback", measuredOn: null }]]);
    const ctx = { size: "M", dims: stiff };
    const nudged = [{ ...at("center", "middle", 1, 1, 0), offsetYMm: 12 }];
    const home = homeCentreMm(nudged, { ...middle, slot: 1 }, ctx)!;
    const r = placeSlabDrop(nudged, { ...middle, slot: 1 }, { kind: "layer", ...middle, depth: 0 }, home + 2, ctx, 4);
    if (!r?.ok) throw new Error("expected a placement");
    expect(r.snap).toBe("home");
    expect(r.placements[0].offsetYMm).toBeUndefined();
    const exact = placeSlabDrop(nudged, { ...middle, slot: 1 }, { kind: "layer", ...middle, depth: 0 }, home + 2, ctx, 0);
    if (!exact?.ok) throw new Error("expected a placement");
    expect(exact.placements[0].offsetYMm).toBe(2);
  });
});
