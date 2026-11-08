import { describe, expect, it } from "vitest";

import { addPiece, removePiece } from "@/lib/configurator/staff-assist";
import { placementsExactMatch, type PillowPlacement } from "../core";
import { GENERIC_POUCH, PILLOW_DIMENSIONS, SEAM_MM, type PouchDimensions, type ResolvedDims } from "../dimensions";
import { fitPillow } from "../fit";
import { alongMm, anchorAlong, FABRIC_GIVE, offerBothWays, settlePillow, settledThicknessMm, spreadCapacityMm, type PieceSettle } from "../settle";
import { cellFrame, layoutPlacements } from "../xray-layout";
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
const CELL = M.lengthMm / 3; // 110 mm
const WALLED = { ...M, subSectionDividers: true };

// 140 mm along, 45 → 25 mm thick. Pressed flat its fabric gives (π/2 − 1) × 20 ≈ 11.4 mm of length
// (by volume alone it could reach 112 mm — a rubber band). In a 110 mm cell it is cut 30 mm short,
// so beside an empty cell it reaches 30 + 11.4 mm into it, no further.
const SPREADER = { widthMm: 180, lengthMm: 140, thicknessMm: 45, minThicknessMm: 25 };
const GIVE = FABRIC_GIVE * 20;
const REACH = 140 - CELL + GIVE; // 41.4 mm
// 30 → 25 mm: 30 mm of its length back plus (π/2 − 1) × 5 of give.
const SMALL_REACH = 140 - CELL + FABRIC_GIVE * 5; // 32.9 mm
const dims = new Map([resolved(1, SPREADER), resolved(2, { ...SPREADER, thicknessMm: 30, minThicknessMm: 25 })]);
const find = (pieces: PieceSettle[], key: string) => pieces.find((s) => s.key === key)!;

describe("spread capacity", () => {
  it("is what the fabric gives as the pouch is pressed flat — a stadium of fixed perimeter — not what the volume would allow", () => {
    expect(alongMm(pouch(SPREADER))).toBe(140);
    expect(FABRIC_GIVE).toBeCloseTo(0.5708, 4);
    expect(spreadCapacityMm(pouch(SPREADER))).toBeCloseTo(GIVE, 6);
    // A pouch short enough that its fill compresses fully first: the volume is the limit.
    expect(spreadCapacityMm(pouch({ ...SPREADER, lengthMm: 10 }))).toBeCloseTo(10 * (45 / 25 - 1), 6);
  });

  it("is the measured flat length instead when the registry has it, and never negative", () => {
    expect(spreadCapacityMm(pouch({ ...SPREADER, flatLengthMm: 200 }))).toBe(60);
    expect(spreadCapacityMm(pouch({ ...SPREADER, flatLengthMm: 100 }))).toBe(0);
    expect(spreadCapacityMm(pouch({ ...SPREADER, minThicknessMm: 50 }))).toBe(0); // min ≥ relaxed: nothing to give
  });

  it("thins by volume down to the minimum, never below", () => {
    expect(settledThicknessMm(pouch(SPREADER), 140)).toBe(45);
    expect(settledThicknessMm(pouch(SPREADER), 210)).toBeCloseTo(30, 6);
    expect(settledThicknessMm(pouch(SPREADER), 252)).toBeCloseTo(25, 6);
    expect(settledThicknessMm(pouch(SPREADER), 1000)).toBe(25);
  });
});

describe("settlePillow", () => {
  it("lets one pouch in center/middle reach both ways by its own length and the fabric's give — never across the voids", () => {
    const settle = settlePillow([at("center", "middle", 1, 1)], { size: "M", dims });
    expect(settle.active).toBe(true);
    expect(settle.cellLengthMm).toBeCloseTo(CELL, 1);
    const s = find(settle.pieces, "center/middle/1");
    expect(s.spreadFrontMm).toBeCloseTo(REACH / 2, 1);
    expect(s.spreadBackMm).toBeCloseTo(REACH / 2, 1);
    // Its footprint is its own length plus the give, and it thins only by that give.
    expect(s.settledLengthMm).toBeCloseTo(140 + GIVE, 1);
    expect(s.settledThicknessMm).toBeCloseTo((45 * 140) / (140 + GIVE), 1);
    expect(s.settledThicknessMm).toBeGreaterThan(40);
    expect([s.spanFrom, s.spanTo]).toEqual(["front", "back"]); // it stands a little into each neighbour
    // Not a rubber band: most of each void stays empty.
    expect(s.spreadFrontMm).toBeLessThan(CELL / 4);
    expect(s.spreadBackMm).toBeLessThan(CELL / 4);
  });

  it("gives its whole reach to the one open side and stays anchored at its own end", () => {
    // Front occupied: the middle pouch spreads back only.
    const [front, middle] = settlePillow([at("center", "front", 1, 1), at("center", "middle", 1, 1)], { size: "M", dims }).pieces;
    expect(middle.spreadFrontMm).toBe(0);
    expect(middle.spreadBackMm).toBeCloseTo(REACH, 1);
    expect(middle.spanTo).toBe("back");
    expect(front.spreadFrontMm).toBe(0);
    expect(front.spreadBackMm).toBe(0); // the middle is occupied on its plane
    // A pouch with little to give leaves the rest of the void at the far end: anchored at its own cell.
    const small = new Map([resolved(1, { ...SPREADER, thicknessMm: 30, minThicknessMm: 25 })]);
    const s = settlePillow([at("center", "front", 1, 1)], { size: "M", dims: small }).pieces[0];
    expect(s.spreadBackMm).toBeCloseTo(SMALL_REACH, 1);
    expect(s.spanTo).toBe("middle"); // partly into the middle, not into the back
    expect(s.settledThicknessMm).toBeCloseTo((30 * 140) / (CELL + SMALL_REACH), 1);
  });

  it("splits a void claimed from both ends pro rata by reach, a seam between, and keeps two pieces", () => {
    // Pouches whose measured flat length lets them reach far: front offers the whole 110 mm void
    // (30 + its 112 mm volume limit), back 30 + 28 = 58 mm. They meet.
    const loose = { ...SPREADER, flatLengthMm: 260 };
    const both = new Map([resolved(1, loose), resolved(2, { ...loose, thicknessMm: 30, minThicknessMm: 25 })]);
    const settle = settlePillow([at("center", "front", 1, 1), at("center", "back", 1, 2)], { size: "M", dims: both });
    const front = find(settle.pieces, "center/front/1");
    const back = find(settle.pieces, "center/back/1");
    const usable = CELL - SEAM_MM;
    const offers = CELL + 58;
    expect(front.spreadBackMm).toBeCloseTo((usable * CELL) / offers, 1);
    expect(back.spreadFrontMm).toBeCloseTo((usable * 58) / offers, 1);
    expect(front.spreadBackMm + back.spreadFrontMm).toBeCloseTo(usable, 1);
    expect(settle.pieces).toHaveLength(2);
    expect([front.spanFrom, front.spanTo]).toEqual(["front", "middle"]);
    expect([back.spanFrom, back.spanTo]).toEqual(["middle", "back"]);
    // Two stuffed pouches with no flat length measured cannot meet: the gap between them stays, no seam deducted.
    const tiny = new Map([resolved(1, { ...SPREADER, thicknessMm: 30, minThicknessMm: 25 })]);
    const apart = settlePillow([at("center", "front", 1, 1), at("center", "back", 1, 1)], { size: "M", dims: tiny }).pieces;
    expect(apart[0].spreadBackMm).toBeCloseTo(SMALL_REACH, 1);
    expect(apart[1].spreadFrontMm).toBeCloseTo(SMALL_REACH, 1);
  });

  it("never crosses a Section wall or a Layer, and only spreads into a column empty on its own plane", () => {
    // left/middle with left front+back occupied: center is empty but is another Section.
    const walls = settlePillow(
      [at("left", "front", 1, 1), at("left", "middle", 1, 1), at("left", "back", 1, 1)],
      { size: "M", dims },
    ).pieces;
    for (const s of walls) {
      expect(s.spreadFrontMm + s.spreadBackMm).toBe(0);
      expect(s.section).toBe("left");
    }
    // The middle holds a piece on plane 0 only: front's plane-1 pouch spreads under it, its plane-0 pouch does not.
    const planes = settlePillow(
      [at("center", "front", 1, 1, 0), at("center", "front", 2, 1, 1), at("center", "middle", 1, 1, 0)],
      { size: "M", dims },
    ).pieces;
    expect(find(planes, "center/front/1").spreadBackMm).toBe(0);
    expect(find(planes, "center/front/2").spreadBackMm).toBeGreaterThan(0);
    expect(find(planes, "center/front/2").depth).toBe(1);
  });

  it("is the identity for a product with walled sub-sections", () => {
    const settle = settlePillow([at("center", "middle", 1, 1)], { size: "M", dims, pillow: WALLED });
    expect(settle.active).toBe(false);
    const s = settle.pieces[0];
    expect([s.spreadFrontMm, s.spreadBackMm]).toEqual([0, 0]);
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

  it("re-derives after a move: a piece moved into the void pushes the neighbour back to its own cell", () => {
    const base = [at("center", "middle", 1, 1)];
    expect(settlePillow(base, { size: "M", dims }).pieces[0].spreadBackMm).toBeGreaterThan(0);
    const added = addPiece(base, { section: "center", subSection: "back" }, 2, null);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const after = settlePillow(added.placements, { size: "M", dims }).pieces;
    expect(find(after, "center/middle/1").spreadBackMm).toBe(0);
    expect(find(after, "center/middle/1").spreadFrontMm).toBeGreaterThan(0);
    // The pack list and the fingerprint are what the Placements say, settled or not.
    expect(placementsExactMatch(added.placements, [...base, at("center", "back", 1, 2)])).toBe(true);
    // Removing it again gives the void back (slice 06 adds moves; a move is a remove + add).
    const removed = removePiece(added.placements, { section: "center", subSection: "back" }, 1);
    expect(find(settlePillow(removed, { size: "M", dims }).pieces, "center/middle/1").spreadBackMm).toBeGreaterThan(0);
  });
});

describe("the nudge anchors the gap (slice 08)", () => {
  // 60 mm along in a 110 mm cell: 50 mm to move in. It reaches its 11.4 mm of give, far less than the 220 mm of void.
  const short = new Map([resolved(1, { ...SPREADER, lengthMm: 60 })]);
  // A measured flat length of 400 mm and 60 × (90/15 − 1) = 300 mm of volume: it fills both voids.
  const filler = new Map([resolved(1, { ...SPREADER, lengthMm: 60, thicknessMm: 90, minThicknessMm: 15, flatLengthMm: 400 })]);
  const alone = (offsetYMm: number | undefined, d: typeof short) =>
    settlePillow([{ ...at("center", "middle", 1, 1), ...(offsetYMm === undefined ? {} : { offsetYMm }) }], { size: "M", dims: d }).pieces[0];

  it("anchorAlong: home is ½, the cell's walls are 0 and 1, a pouch as long as its cell stays home", () => {
    expect(anchorAlong(0, CELL, 60)).toBe(0.5);
    expect(anchorAlong(25, CELL, 60)).toBe(1);
    expect(anchorAlong(-25, CELL, 60)).toBe(0);
    expect(anchorAlong(12.5, CELL, 60)).toBeCloseTo(0.75, 6);
    expect(anchorAlong(40, CELL, 140)).toBe(0.5);
  });

  it("offerBothWays at home is the plain pro rata split, and a lone void still takes the capacity whatever the anchor", () => {
    expect(offerBothWays(48, 110, 110)).toEqual([24, 24]);
    expect(offerBothWays(48, 110, 110, 0.5)).toEqual([24, 24]);
    expect(offerBothWays(48, 110, 0, 1)).toEqual([48, 0]);
    expect(offerBothWays(48, 0, 110, 0)).toEqual([0, 48]);
  });

  it("with a void larger than its reach: a back nudge leaves the gap at the front, a front nudge at the back", () => {
    const home = alone(undefined, short);
    expect(home.spreadFrontMm).toBeCloseTo(GIVE / 2, 1);
    expect(home.spreadBackMm).toBeCloseTo(GIVE / 2, 1);
    const back = alone(25, short);
    expect(back.spreadFrontMm).toBe(0);
    expect(back.spreadBackMm).toBeCloseTo(GIVE, 1);
    const front = alone(-25, short);
    expect(front.spreadFrontMm).toBeCloseTo(GIVE, 1);
    expect(front.spreadBackMm).toBe(0);
    // Part way: favours the side it leans to, the same total either way.
    const lean = alone(10, short);
    expect(lean.spreadBackMm).toBeGreaterThan(lean.spreadFrontMm);
    expect(lean.spreadFrontMm + lean.spreadBackMm).toBeCloseTo(GIVE, 1);
  });

  it("with a void it can fill, the settled spread is the same for every nudge", () => {
    for (const off of [undefined, -25, -10, 10, 25]) {
      const s = alone(off, filler);
      expect(s.spreadFrontMm).toBeCloseTo(CELL, 1);
      expect(s.spreadBackMm).toBeCloseTo(CELL, 1);
    }
  });

  it("draws it that way: a back-nudged pouch's settled rect reaches the back and stops short of the front", () => {
    const stage = stageGeometry("M");
    const placements = [{ ...at("center", "middle", 1, 1), offsetYMm: 25 }];
    const [p] = layoutPlacements(placements, { stage, dims: short, fit: fitPillow(placements, { size: "M", dims: short }) });
    expect(p.settled.y).toBeCloseTo(p.y, 1); // nothing spread forward: the gap is in front
    expect(p.settled.y + p.settled.h).toBeCloseTo(p.y + p.h + GIVE * stage.k + 1, 0); // + the hair its cell's back edge kept
  });
});

describe("fitPillow reads the settle", () => {
  it("reports a lower middle loft and a non-zero back loft for the spill case", () => {
    const placements = [at("center", "middle", 1, 1, 0), at("center", "middle", 2, 1, 1)];
    const authored = fitPillow(placements, { size: "M", dims, pillow: WALLED });
    const settled = fitPillow(placements, { size: "M", dims });
    expect(authored.sections.center.loftBySubSection).toEqual({ front: 0, middle: 90, back: 0 });
    expect(settled.sections.center.loftBySubSection.middle).toBeLessThan(90);
    expect(settled.sections.center.loftBySubSection.back).toBeGreaterThan(0);
    expect(settled.sections.center.loftBySubSection.front).toBe(settled.sections.center.loftBySubSection.back);
    expect(settled.settle.active).toBe(true);
    expect(settled.cells[0].loftLayers).toBe(2);
  });

  it("settling relieves a stack only by what the fabric gives — a real excess stays compressed", () => {
    // 3 × 60 mm relaxed = 180 > the M side budget (168.3). Front and back empty: each pouch gets its
    // 30 mm back and (π/2 − 1) × 20 = 11.4 mm of give, so stands at 60 × 140 / 151.4 = 55.5 mm — 166.4 in all.
    const thick = new Map([resolved(1, { ...SPREADER, thicknessMm: 60, minThicknessMm: 40 })]);
    const stack = [0, 1, 2].map((row) => at("left", "middle", row + 1, 1, row));
    expect(fitPillow(stack, { size: "M", dims: thick, pillow: WALLED }).status).toBe("compressed");
    const settled = fitPillow(stack, { size: "M", dims: thick });
    expect(settled.status).toBe("ok");
    expect(settled.sections.left.loftBySubSection.middle).toBeCloseTo(3 * ((60 * 140) / (140 + GIVE)), 0);
    expect(settled.sections.left.loftBySubSection.back).toBe(settled.sections.left.loftBySubSection.middle);
    // 3 × 70 = 210: the give takes it to 3 × 62.4 = 187, still over the budget. No rubber band spreads it away.
    const thicker = new Map([resolved(1, { ...SPREADER, thicknessMm: 70, minThicknessMm: 40 })]);
    expect(fitPillow(stack, { size: "M", dims: thicker }).status).toBe("compressed");
    // ponytail: `over` cannot flip by settling — the fully compressed floor is
    // volume-invariant (Σ minThickness is the same however far the fill spreads).
    // 3 × 58 = 174 > 168.3 even fully compressed; the 1.1 mm of give each changes nothing.
    const over = new Map([resolved(1, { ...SPREADER, thicknessMm: 60, minThicknessMm: 58 })]);
    expect(fitPillow(stack, { size: "M", dims: over, pillow: WALLED }).status).toBe("over");
    expect(fitPillow(stack, { size: "M", dims: over }).status).toBe("over");
  });

  it("counts a neighbour's settled fill in the column it stands in, at its own plane", () => {
    // Plane 0 is full front to back (nothing spreads there); the front's plane-1
    // pouch (32.9 mm of reach) settles that far under the middle's pouch and no further.
    const placements = [
      at("center", "front", 1, 1, 0),
      at("center", "front", 2, 2, 1),
      at("center", "middle", 1, 1, 0),
      at("center", "back", 1, 1, 0),
    ];
    const fit = fitPillow(placements, { size: "M", dims });
    const middle = fit.cells.find((c) => c.subSection === "middle")!;
    expect(middle.layers).toHaveLength(1);
    expect(middle.loftLayers).toBe(2);
    expect(fit.sections.center.loftBySubSection.back).toBe(45);
    expect(fit.sections.center.loftBySubSection.middle).toBeCloseTo(45 + (30 * 140) / (CELL + SMALL_REACH), 1);
    expect(fit.sections.center.loftBySubSection.front).toBeCloseTo(45 + (30 * 140) / (CELL + SMALL_REACH), 1);
  });
});

describe("layout draws the settled rect", () => {
  const stage = stageGeometry("M");

  it("keeps the authored rect and adds a settled one spread into the void, anchored at the authored end", () => {
    const placements = [at("center", "front", 1, 1)];
    const fit = fitPillow(placements, { size: "M", dims });
    const [p] = layoutPlacements(placements, { stage, dims, fit });
    const frame = cellFrame("center", "front", stage);
    expect(p.y + p.h / 2).toBeCloseTo(frame.y + frame.h / 2, 0); // authored: centred in its cell
    expect(p.settled.x).toBe(p.x);
    expect(p.settled.w).toBe(p.w);
    expect(p.settled.y).toBe(p.y); // anchored at the front end
    // Its whole reach into the two-cell void behind it — no more; it gives back the hair its cell's edge kept (INSET).
    expect(p.settled.h).toBeCloseTo(p.h + REACH * stage.k + 1, 0);
    expect(p.settled.y + p.settled.h).toBeLessThanOrEqual(stage.rowY[3]);
  });

  it("is the authored rect when nothing spreads, and without a fit", () => {
    const placements = [at("center", "front", 1, 1), at("center", "middle", 1, 1), at("center", "back", 1, 1)];
    const fit = fitPillow(placements, { size: "M", dims });
    for (const p of layoutPlacements(placements, { stage, dims, fit })) expect(p.settled).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
    for (const p of layoutPlacements(placements, { stage, dims })) expect(p.settled).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
  });

  it("stays two rects a seam apart when two pouches meet in a void", () => {
    const placements = [at("center", "front", 1, 1), at("center", "back", 1, 1)];
    const fit = fitPillow(placements, { size: "M", dims });
    const [front, back] = layoutPlacements(placements, { stage, dims, fit });
    expect(front.subSection).toBe("front");
    expect(back.settled.y - (front.settled.y + front.settled.h)).toBeGreaterThanOrEqual(SEAM_MM * stage.k - 0.2);
  });

  it("steps a settled stack by its settled thickness: a spread stack draws shallower", () => {
    const two = [at("center", "middle", 1, 1, 0), at("center", "middle", 2, 1, 1)];
    const spread = layoutPlacements(two, { stage, dims, fit: fitPillow(two, { size: "M", dims }) });
    const walled = layoutPlacements(two, { stage, dims, fit: fitPillow(two, { size: "M", dims, pillow: WALLED }) });
    // Depth draws across only (front ↔ back is the settle's, as the cut draws it).
    const deep = (l: typeof spread) => l.find((p) => p.depth === 1)!.x - l.find((p) => p.depth === 0)!.x;
    expect(deep(spread)).toBeGreaterThan(0);
    expect(deep(spread)).toBeLessThan(deep(walled));
  });
});
