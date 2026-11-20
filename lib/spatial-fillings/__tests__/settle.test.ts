import { describe, expect, it } from "vitest";

import { addPiece, removePiece } from "@/lib/configurator/staff-assist";
import { placementsExactMatch, type PillowPlacement } from "../core";
import { GENERIC_POUCH, PILLOW_DIMENSIONS, type PouchDimensions, type ResolvedDims } from "../dimensions";
import { fitMessage, fitPillow } from "../fit";
import { alongMm, extentAlong, settlePillow, type PieceSettle } from "../settle";
import { layoutPlacements } from "../xray-layout";
import { stageGeometry } from "../xray-stage";

const pouch = (dims: Partial<PouchDimensions>): PouchDimensions => ({ ...GENERIC_POUCH, ...dims });
const resolved = (id: number, dims: Partial<PouchDimensions>): [number, ResolvedDims] => [
  id,
  { key: `k${id}`, kind: "pouch", source: "measured", measuredOn: "2026-10-01", dims: pouch(dims) },
];
const at = (
  section: PillowPlacement["section"],
  subSection: PillowPlacement["subSection"],
  slot: number,
  itemId: number,
  row?: number,
): PillowPlacement => ({ section, subSection, slot, itemId, ...(row === undefined ? {} : { row }) });

const M = PILLOW_DIMENSIONS.M;
const CELL = M.lengthMm / 3;
const WALLED = { ...M, subSectionDividers: true };

const LONG = { widthMm: 180, lengthMm: 140, thicknessMm: 45, minThicknessMm: 25 };
const dims = new Map([
  resolved(1, LONG),
  resolved(2, { ...LONG, thicknessMm: 30, minThicknessMm: 25 }),
  resolved(3, { ...LONG, lengthMm: 60 }),
  resolved(4, { ...LONG, lengthMm: 100 }),
]);
const find = (pieces: PieceSettle[], key: string) => pieces.find((s) => s.key === key)!;

describe("settlePillow: true size (9-11-2026)", () => {
  it("stands a pouch at its own length, centred on its cell: never cut to the cell, never slumped past its length", () => {
    const settle = settlePillow([at("center", "middle", 1, 1)], { size: "M", dims });
    expect(settle.active).toBe(true);
    expect(settle.cellLengthMm).toBeCloseTo(CELL, 1);
    const s = find(settle.pieces, "center/middle/1");
    expect(alongMm(pouch(LONG))).toBe(140);
    expect([s.startMm, s.endMm]).toEqual([95, 235]);
    expect(s.settledLengthMm).toBe(140);
    expect([s.spreadFrontMm, s.spreadBackMm]).toEqual([0, 0]);
    expect(s.settledThicknessMm).toBe(45);
    expect([s.spanFrom, s.spanTo]).toEqual(["middle", "middle"]);
  });

  it("keeps the whole of it in its Section: against the front or back wall it is pushed in", () => {
    const [front] = settlePillow([at("center", "front", 1, 1)], { size: "M", dims }).pieces;
    expect([front.startMm, front.endMm]).toEqual([0, 140]);
    const [back] = settlePillow([at("center", "back", 1, 1)], { size: "M", dims }).pieces;
    expect([back.startMm, back.endMm]).toEqual([190, 330]);
    const [short] = settlePillow([at("center", "middle", 1, 3)], { size: "M", dims }).pieces;
    expect([short.startMm, short.endMm]).toEqual([135, 195]);
  });

  it("stuffs neighbours longer together than the Section end to end, pressed shorter alike, never laid over", () => {
    const full = settlePillow([at("left", "front", 1, 1), at("left", "middle", 1, 1), at("left", "back", 1, 1)], { size: "M", dims }).pieces;
    expect(full.map((s) => [s.startMm, s.endMm])).toEqual([
      [0, 110],
      [110, 220],
      [220, 330],
    ]);
    for (const s of full) {
      expect(s.alongMm).toBe(140);
      expect(s.settledLengthMm).toBe(110);
      expect(s.spanFrom).toBe(s.subSection);
      expect(s.spanTo).toBe(s.subSection);
      expect(s.section).toBe("left");
    }
    const two = settlePillow([at("left", "front", 1, 1), at("left", "middle", 1, 1)], { size: "M", dims }).pieces;
    expect(two.map((s) => [s.startMm, s.endMm])).toEqual([
      [0, 140],
      [140, 280],
    ]);
    const neckDims = new Map([...dims, [5, { key: "neck/m", kind: "neck", source: "configured", measuredOn: null, dims: pouch({ widthMm: 300, lengthMm: 140, thicknessMm: 140, minThicknessMm: 80 }) } as ResolvedDims]]);
    const withNeck = settlePillow([at("left", "front", 1, 1), at("left", "middle", 1, 1), at("left", "back", 1, 5)], { size: "M", dims: neckDims }).pieces;
    expect(withNeck.map((s) => [s.startMm, s.endMm])).toEqual([
      [0, 95],
      [95, 190],
      [190, 330],
    ]);
    const fits = settlePillow([at("left", "front", 1, 4), at("left", "middle", 1, 4), at("left", "back", 1, 4)], { size: "M", dims }).pieces;
    expect(fits.map((s) => [s.startMm, s.endMm])).toEqual([
      [5, 105],
      [115, 215],
      [225, 325],
    ]);
  });

  it("slides a nudged pouch where its Layer leaves room: its centre stays in its own and the free columns beside it", () => {
    const nudged = (offsetYMm: number, itemId: number, back = false, front = false) =>
      settlePillow(
        [{ ...at("center", "middle", 1, itemId), offsetYMm }, ...(back ? [at("center", "back", 1, 1)] : []), ...(front ? [at("center", "front", 1, 1)] : [])],
        { size: "M", dims },
      ).pieces.find((q) => q.subSection === "middle")!;
    expect([nudged(25, 3).startMm, nudged(25, 3).endMm]).toEqual([160, 220]);
    const far = nudged(100, 3);
    expect([far.startMm, far.endMm]).toEqual([235, 295]);
    expect([far.spanFrom, far.spanTo]).toEqual(["middle", "back"]);
    expect([far.reachFrom, far.reachTo]).toEqual(["front", "back"]);
    expect([nudged(100, 3, true).startMm, nudged(100, 3, true).endMm]).toEqual([160, 220]);
    expect([nudged(40, 1, true).startMm, nudged(40, 1, true).endMm]).toEqual([80, 220]);
    for (const off of [-40, 0, 40]) expect([nudged(off, 1, true, true).startMm, nudged(off, 1, true, true).endMm]).toEqual([110, 220]);
    const held = settlePillow([{ ...at("center", "middle", 1, 1), offsetYMm: 30 }, at("center", "back", 1, 1)], { size: "M", dims }).pieces;
    expect(held.map((s) => [s.startMm, s.endMm])).toEqual([
      [80, 220],
      [220, 330],
    ]);
    expect(extentAlong(0, CELL, 140, -50, 0, 2)).toEqual({ startMm: 0, endMm: 140 });
  });

  it("cuts a pouch to its cell in a product with walled sub-sections", () => {
    const settle = settlePillow([at("center", "middle", 1, 1)], { size: "M", dims, pillow: WALLED });
    expect(settle.active).toBe(false);
    const s = settle.pieces[0];
    expect(s.startMm).toBeCloseTo(CELL, 1);
    expect(s.endMm).toBeCloseTo(2 * CELL, 1);
    expect(s.settledThicknessMm).toBe(s.thicknessMm);
    expect([s.spanFrom, s.spanTo]).toEqual(["middle", "middle"]);
  });

  it("is input-order independent and byte-identical across calls, and writes nothing", () => {
    const placements = [at("center", "back", 2, 2, 1), at("center", "front", 1, 1), at("left", "middle", 1, 1), at("center", "back", 1, 1)];
    const before = JSON.stringify(placements);
    const a = settlePillow(placements, { size: "M", dims });
    const b = settlePillow([...placements].reverse(), { size: "M", dims });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(settlePillow(placements, { size: "M", dims }))).toBe(JSON.stringify(a));
    expect(a.pieces.map((s) => s.key)).toEqual(["left/middle/1", "center/front/1", "center/back/1", "center/back/2"]);
    expect(JSON.stringify(placements)).toBe(before);
    expect(placementsExactMatch(placements, JSON.parse(before))).toBe(true);
  });

  it("re-derives after a move: a neighbour added beside a pouch only takes away the room it could slide in", () => {
    const base = [at("center", "middle", 1, 1)];
    expect(settlePillow(base, { size: "M", dims }).pieces[0].reachTo).toBe("back");
    const added = addPiece(base, { section: "center", subSection: "back" }, 2, null);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const after = find(settlePillow(added.placements, { size: "M", dims }).pieces, "center/middle/1");
    expect([after.startMm, after.endMm]).toEqual([50, 190]);
    expect(after.reachTo).toBe("middle");
    expect(placementsExactMatch(added.placements, [...base, at("center", "back", 1, 2)])).toBe(true);
    const removed = removePiece(added.placements, { section: "center", subSection: "back" }, 1);
    expect(find(settlePillow(removed, { size: "M", dims }).pieces, "center/middle/1").reachTo).toBe("back");
  });
});

describe("fitPillow reads the settle", () => {
  it("marks the cells whose pouches are pressed shorter end to end compressed, and says by how much", () => {
    const fit = fitPillow([at("left", "front", 1, 1), at("left", "middle", 1, 1), at("left", "back", 1, 1)], { size: "M", dims });
    const cell = (sub: string) => fit.cells.find((c) => c.subSection === sub)!;
    expect(cell("front").pressedMm).toBe(30);
    expect(cell("front").pressedBy).toEqual(["middle"]);
    expect(cell("middle").pressedBy).toEqual(["front", "back"]);
    for (const c of fit.cells) expect(c.status).toBe("compressed");
    expect(fit.sections.left.status).toBe("compressed");
    expect(fitMessage(cell("front"), "M")).toBe(
      "left · front: pressed 30 mm shorter by middle, compressed; the pouches are longer together than the 330 mm front to back of Size M",
    );
    const roomy = fitPillow([at("left", "front", 1, 1), at("left", "middle", 1, 1)], { size: "M", dims });
    for (const c of roomy.cells) expect([c.status, c.pressedMm]).toEqual(["ok", 0]);
  });

  it("does not mark pouches that fit end to end, or ones that lie in other Layers", () => {
    const fits = fitPillow([at("left", "front", 1, 4), at("left", "middle", 1, 4), at("left", "back", 1, 4)], { size: "M", dims });
    for (const c of fits.cells) expect([c.status, c.pressedMm]).toEqual(["ok", 0]);
    const layered = fitPillow([at("center", "front", 1, 4, 0), at("center", "front", 2, 1, 1), at("center", "middle", 1, 4, 0)], { size: "M", dims });
    expect(layered.cells.every((c) => c.pressedMm === 0)).toBe(true);
  });

  it("judges a stack's loft at its own thickness: nothing settles a stack thinner", () => {
    const thick = new Map([resolved(1, { ...LONG, thicknessMm: 60, minThicknessMm: 40 })]);
    const stack = [0, 1, 2].map((row) => at("left", "middle", row + 1, 1, row));
    expect(fitPillow(stack, { size: "M", dims: thick, pillow: WALLED }).status).toBe("compressed");
    const settled = fitPillow(stack, { size: "M", dims: thick });
    expect(settled.status).toBe("compressed");
    expect(settled.sections.left.loftBySubSection).toEqual({ front: 0, middle: settled.sections.left.loftBySubSection.middle, back: 0 });
    const over = new Map([resolved(1, { ...LONG, thicknessMm: 60, minThicknessMm: 58 })]);
    expect(fitPillow(stack, { size: "M", dims: over }).status).toBe("over");
  });

  it("counts a pouch slid into a free column in that column's loft too", () => {
    const placements = [{ ...at("center", "middle", 1, 3), offsetYMm: 100 }];
    const fit = fitPillow(placements, { size: "M", dims });
    expect(fit.sections.center.loftBySubSection.back).toBe(45);
    expect(fit.cells[0].settledInto).toEqual(["back"]);
  });
});

describe("layout draws the settled rect", () => {
  const stage = stageGeometry("M");
  const mm = (v: number) => v / stage.k;

  it("draws every pouch where the settle stands it, end to end, remembering its own length; the authored rect the same", () => {
    const placements = [at("left", "front", 1, 1), at("left", "middle", 1, 1), at("left", "back", 1, 1)];
    const fit = fitPillow(placements, { size: "M", dims });
    const pieces = layoutPlacements(placements, { stage, dims, fit });
    for (const p of pieces) {
      expect(p.settled).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
      expect(mm(p.h)).toBeGreaterThan(107);
      expect(mm(p.h)).toBeLessThanOrEqual(110.5);
      expect(mm(p.relaxedH)).toBeGreaterThan(136);
      expect(mm(p.relaxedH)).toBeLessThanOrEqual(140.5);
      expect(mm(p.w)).toBeCloseTo(180, 0);
    }
    const [front, middle, back] = ["front", "middle", "back"].map((sub) => pieces.find((p) => p.subSection === sub)!);
    expect(middle.y).toBeGreaterThanOrEqual(front.y + front.h);
    expect(back.y).toBeGreaterThanOrEqual(middle.y + middle.h);
    const alone = layoutPlacements([at("left", "middle", 1, 1)], { stage, dims })[0];
    expect(alone.relaxedH).toBe(alone.h);
    for (const p of layoutPlacements(placements, { stage, dims })) expect(p.settled).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
  });

  it("steps a stack by its thickness, the same as a walled product's", () => {
    const two = [at("center", "middle", 1, 1, 0), at("center", "middle", 2, 1, 1)];
    const open = layoutPlacements(two, { stage, dims, fit: fitPillow(two, { size: "M", dims }) });
    const walled = layoutPlacements(two, { stage, dims, fit: fitPillow(two, { size: "M", dims, pillow: WALLED }) });
    const deep = (l: typeof open) => l.find((p) => p.depth === 1)!.x - l.find((p) => p.depth === 0)!.x;
    expect(deep(open)).toBeGreaterThan(0);
    expect(deep(open)).toBeCloseTo(deep(walled), 6);
  });
});
