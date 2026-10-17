import { describe, expect, it } from "vitest";

import {
  addPiece,
  cellLayers,
  mirrorSection,
  movePiece,
  nudgePiece,
  reorderedRef,
  reorderInLayer,
  shiftPieceLayer,
  type PieceRef,
} from "@/lib/configurator/staff-assist";
import { flattenToPackList, placementsExactMatch, type PillowPlacement } from "@/lib/spatial-fillings/core";
import { GENERIC_POUCH, PILLOW_DIMENSIONS, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";

const at = (section: PillowPlacement["section"], subSection: PillowPlacement["subSection"], slot: number, itemId: number, extra: Partial<PillowPlacement> = {}): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId,
  ...extra,
});
const ref = (section: PillowPlacement["section"], subSection: PillowPlacement["subSection"], slot: number): PieceRef => ({ section, subSection, slot });
const inCell = (ps: PillowPlacement[], section: string, subSection: string) => ps.filter((p) => p.section === section && p.subSection === subSection);
const slotsUnique = (ps: PillowPlacement[]) => {
  const keys = ps.map((p) => `${p.section}/${p.subSection}/${p.slot}`);
  return new Set(keys).size === keys.length;
};
const dense = (ps: PillowPlacement[], section: PillowPlacement["section"], subSection: PillowPlacement["subSection"]) => {
  const layers = cellLayers(ps, { section, subSection });
  const rows = [...new Set(inCell(ps, section, subSection).map((p) => p.row ?? 0))].sort((a, b) => a - b);
  return rows.every((r, i) => r === i) && layers.every((l) => l.length > 0);
};

const base: PillowPlacement[] = [
  at("left", "front", 1, 11, { insertOrder: 1 }),
  at("left", "front", 2, 12, { row: 0, insertOrder: 2 }),
  at("left", "middle", 1, 21, { row: 0, insertOrder: 3 }),
  at("left", "middle", 3, 22, { row: 1 }),
  at("center", "middle", 1, 31),
];

describe("movePiece", () => {
  it("moves across cells within a Section: unique slots, dense layers on both sides, insertOrder kept", () => {
    const r = movePiece(base, ref("left", "front", 2), { cell: { section: "left", subSection: "back" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(slotsUnique(r.placements)).toBe(true);
    expect(dense(r.placements, "left", "front")).toBe(true);
    expect(dense(r.placements, "left", "back")).toBe(true);
    const moved = inCell(r.placements, "left", "back")[0];
    expect(moved.itemId).toBe(12);
    expect(moved.insertOrder).toBe(2);
    expect(moved.slot).toBe(1);
    expect(r.ref).toEqual({ section: "left", subSection: "back", slot: 1 });
    expect(inCell(r.placements, "left", "front").map((p) => p.itemId)).toEqual([11]);
    // The pack list is what the Placements say, wherever they sit.
    expect(flattenToPackList(r.placements)).toEqual(flattenToPackList(base));
  });

  it("drops insertOrder when the piece leaves its Section and re-slots in the target", () => {
    const r = movePiece(base, ref("left", "middle", 1), { cell: { section: "center", subSection: "middle" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = inCell(r.placements, "center", "middle").find((p) => p.itemId === 21)!;
    expect(moved.insertOrder).toBeUndefined();
    expect(moved.slot).toBe(2);
    // The Layer it left (the top one) closes up: item 22 is now the only, top Layer.
    expect(cellLayers(r.placements, { section: "left", subSection: "middle" }).map((l) => l.map((p) => p.itemId))).toEqual([[22]]);
    expect(inCell(r.placements, "left", "middle")[0].row).toBeUndefined();
  });

  it("targets a Layer and a position when asked, and stays put on a same-cell no-op", () => {
    // Into the centre cell's second (new) Layer.
    const r = movePiece(base, ref("left", "front", 1), { cell: { section: "center", subSection: "middle" }, layer: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(cellLayers(r.placements, { section: "center", subSection: "middle" }).map((l) => l.map((p) => p.itemId))).toEqual([[31], [11]]);
    // Into an existing Layer at position 0: the newcomer takes the lower slot.
    const first = movePiece(base, ref("left", "middle", 3), { cell: { section: "left", subSection: "front" }, layer: 0, index: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(cellLayers(first.placements, { section: "left", subSection: "front" })[0].map((p) => p.itemId)).toEqual([22, 11, 12]);
    expect(first.ref.slot).toBe(1);
    expect(slotsUnique(first.placements)).toBe(true);
    // Same cell, same Layer, no index: the same recipe, same slot.
    const noop = movePiece(base, ref("left", "front", 2), { cell: { section: "left", subSection: "front" }, layer: 0 });
    expect(noop.ok && placementsExactMatch(noop.placements, base) && noop.ref.slot === 2).toBe(true);
  });

  it("refuses a full target Layer, a full cell and an unknown piece with addPiece's shapes", () => {
    let full: PillowPlacement[] = [];
    for (let i = 0; i < 5; i++) {
      const r = addPiece(full, { section: "right", subSection: "back" }, 40 + i, 0);
      if (r.ok) full = r.placements;
    }
    const refused = movePiece([...base, ...full], ref("left", "front", 1), { cell: { section: "right", subSection: "back" }, layer: 0 });
    expect(refused).toEqual({ ok: false, error: "Max 5 pieces per layer" });
    let cap: PillowPlacement[] = [];
    for (let i = 0; i < 25; i++) {
      const r = addPiece(cap, { section: "right", subSection: "front" }, 50 + i, null);
      if (r.ok) cap = r.placements;
    }
    // A cell at its cap has five full Layers: the Layer ceiling answers first, exactly as addPiece does.
    const capped = movePiece([...base, ...cap], ref("left", "front", 1), { cell: { section: "right", subSection: "front" } });
    expect(capped).toEqual(addPiece([...base, ...cap], { section: "right", subSection: "front" }, 99, null));
    expect(capped.ok).toBe(false);
    expect(movePiece(base, ref("right", "back", 9), { cell: { section: "left", subSection: "front" } }).ok).toBe(false);
  });

  it("moves into a cell that cannot close — fit warns, never refuses", () => {
    const thick: ResolvedDims = { key: "k", kind: "pouch", source: "measured", measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, thicknessMm: 60, minThicknessMm: 50 } };
    const dims = new Map([[1, thick]]);
    const ctx = { size: "M", dims, pillow: { ...PILLOW_DIMENSIONS.M, subSectionDividers: true } };
    // Three 60 mm (min 50) planes in the centre: 150 min > 140.8 — a fourth cannot close either.
    const stack = [0, 1, 2].map((row) => at("center", "middle", row + 1, 1, { row }));
    const over = movePiece([...stack, at("left", "front", 1, 1)], ref("left", "front", 1), { cell: { section: "center", subSection: "middle" }, layer: 3 });
    expect(over.ok).toBe(true);
    if (over.ok) expect(fitPillow(over.placements, ctx).cells.find((c) => c.section === "center" && c.subSection === "middle")!.status).toBe("over");
  });
});

describe("shiftPieceLayer", () => {
  it("creates a Layer under the deepest, closes the one left behind, and no-ops at the top", () => {
    const down = shiftPieceLayer(base, ref("left", "front", 1), 1);
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(cellLayers(down.placements, { section: "left", subSection: "front" }).map((l) => l.map((p) => p.itemId))).toEqual([[12], [11]]);
    expect(down.ref).toEqual(ref("left", "front", 1));
    // Back up: the second Layer empties and closes.
    const up = shiftPieceLayer(down.placements, down.ref, -1);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(cellLayers(up.placements, { section: "left", subSection: "front" }).map((l) => l.map((p) => p.itemId))).toEqual([[11, 12]]);
    expect(up.placements.every((p) => p.section !== "left" || p.subSection !== "front" || p.row === undefined)).toBe(true);
    // Already on top: nothing to do, the input comes back.
    const top = shiftPieceLayer(base, ref("left", "front", 1), -1);
    expect(top.ok && top.placements).toBe(base);
    // Alone in the deepest Layer: going down is a no-op too.
    const alone = shiftPieceLayer(base, ref("left", "middle", 3), 1);
    expect(alone.ok && alone.placements).toBe(base);
  });

  it("a lone top piece goes down into the next Layer, and a move deeper in its own cell lands where asked", () => {
    const three = [at("right", "back", 1, 1, { row: 0 }), at("right", "back", 2, 2, { row: 1 }), at("right", "back", 3, 3, { row: 2 })];
    const cell = { section: "right", subSection: "back" } as const;
    const layersOf = (r: ReturnType<typeof movePiece>) => (r.ok ? cellLayers(r.placements, cell).map((l) => l.map((p) => p.itemId)) : r.error);
    expect(layersOf(shiftPieceLayer(three, ref("right", "back", 1), 1))).toEqual([[1, 2], [3]]);
    // Index 1 of the Layers left behind is the third one's.
    expect(layersOf(movePiece(three, ref("right", "back", 1), { cell, layer: 1 }))).toEqual([[2], [1, 3]]);
    expect(layersOf(movePiece(three, ref("right", "back", 1), { cell, layer: 2 }))).toEqual([[2], [3], [1]]);
  });

  it("moving the only piece out of a middle Layer closes it and the deeper one moves up", () => {
    const three = [at("right", "back", 1, 1, { row: 0 }), at("right", "back", 2, 2, { row: 1 }), at("right", "back", 3, 3, { row: 2 })];
    const r = shiftPieceLayer(three, ref("right", "back", 2), -1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(cellLayers(r.placements, { section: "right", subSection: "back" }).map((l) => l.map((p) => p.itemId))).toEqual([[1, 2], [3]]);
  });
});

describe("reorderInLayer", () => {
  it("swaps slots with the neighbour, and returns the same reference at the row's end", () => {
    const right = reorderInLayer(base, ref("left", "front", 1), 1);
    expect(cellLayers(right, { section: "left", subSection: "front" })[0].map((p) => p.itemId)).toEqual([12, 11]);
    expect(slotsUnique(right)).toBe(true);
    expect(reorderedRef(base, ref("left", "front", 1), 1)).toEqual(ref("left", "front", 2));
    // Nothing downstream moves: same multiset per cell, same pack list.
    expect(placementsExactMatch(right, base)).toBe(true);
    expect(reorderInLayer(base, ref("left", "front", 1), -1)).toBe(base);
    expect(reorderInLayer(base, ref("left", "front", 2), 1)).toBe(base);
    expect(reorderedRef(base, ref("left", "front", 2), 1)).toEqual(ref("left", "front", 2));
    // Pieces on another Layer of the same cell are not neighbours.
    expect(reorderInLayer(base, ref("left", "middle", 1), 1)).toBe(base);
  });
});

describe("fine offsets (slice 08)", () => {
  const base = [at("left", "middle", 1, 7, { offsetXMm: -30, offsetYMm: 10 }), at("left", "middle", 2, 8)];

  it("nudgePiece sets, rounds and bounds the offset, and drops it at home", () => {
    const moved = nudgePiece(base, ref("left", "middle", 2), { xMm: 12.4, yMm: -900 });
    expect(moved.find((p) => p.slot === 2)).toEqual(at("left", "middle", 2, 8, { offsetXMm: 12, offsetYMm: -200 }));
    const home = nudgePiece(base, ref("left", "middle", 1), { xMm: 0, yMm: 0.2 });
    expect(home.find((p) => p.slot === 1)).toEqual(at("left", "middle", 1, 7));
    expect(nudgePiece(base, ref("left", "middle", 1), { xMm: -30, yMm: 10 })).toBe(base);
    expect(placementsExactMatch(moved, base)).toBe(true);
  });

  it("a move keeps the offset inside its cell and resets it in a new one", () => {
    const layer = movePiece(base, ref("left", "middle", 1), { cell: { section: "left", subSection: "middle" }, layer: 1 });
    expect(layer.ok && layer.placements.find((p) => p.itemId === 7)?.offsetXMm).toBe(-30);
    const away = movePiece(base, ref("left", "middle", 1), { cell: { section: "center", subSection: "front" } });
    const p = away.ok ? away.placements.find((q) => q.itemId === 7) : undefined;
    expect(p && "offsetXMm" in p).toBe(false);
    expect(p && "offsetYMm" in p).toBe(false);
  });

  it("a mirror flips the offset across the centre line", () => {
    const mirrored = mirrorSection(base, "left").find((p) => p.section === "right" && p.itemId === 7);
    expect(mirrored?.offsetXMm).toBe(30);
    expect(mirrored?.offsetYMm).toBe(10);
  });
});
