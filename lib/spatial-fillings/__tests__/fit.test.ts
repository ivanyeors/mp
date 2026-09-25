import { describe, expect, it } from "vitest";

import { addPiece } from "@/lib/configurator/staff-assist";
import type { PillowPlacement } from "../core";
import { GENERIC_POUCH, LOFT_ALLOWANCE, PILLOW_DIMENSIONS, type PouchDimensions, type ResolvedDims } from "../dimensions";
import { applyFitChange, fitCell, fitLayer, fitMessage, fitPillow, wouldFit, SEAM_MM } from "../fit";
import { layoutPlacements, cellFrame, GAP } from "../xray-layout";
import { stageGeometry } from "../xray-stage";

const pouch = (dims: Partial<PouchDimensions>): PouchDimensions => ({ ...GENERIC_POUCH, ...dims });
const resolved = (id: number, dims: Partial<PouchDimensions>): [number, ResolvedDims] => [
  id,
  { key: `k${id}`, kind: "pouch", source: "measured", measuredOn: "2026-10-01", dims: pouch(dims) },
];
const piece = (id: number, dims: Partial<PouchDimensions>) => ({ slot: id, itemId: id, dims: pouch(dims) });

const at = (section: PillowPlacement["section"], subSection: PillowPlacement["subSection"], slot: number, itemId: number, row?: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId,
  ...(row === undefined ? {} : { row }),
});

describe("fitLayer", () => {
  it("is ok with ratios 1 when the relaxed widths fit", () => {
    const layer = fitLayer([piece(1, { widthMm: 100, minWidthMm: 80 }), piece(2, { widthMm: 100, minWidthMm: 80 })], 260);
    expect(layer.status).toBe("ok");
    expect(layer.relaxedMm).toBe(200 + SEAM_MM);
    expect(layer.pieces.map((p) => p.widthRatio)).toEqual([1, 1]);
  });

  it("compresses pro rata: Σ (width × ratio) + seams = available, no piece below its minimum", () => {
    const layer = fitLayer(
      [piece(1, { widthMm: 150, minWidthMm: 100 }), piece(2, { widthMm: 150, minWidthMm: 130 })],
      240,
    );
    expect(layer.status).toBe("compressed");
    const drawn = layer.pieces.reduce((s, p) => s + p.acrossMm * p.widthRatio, 0) + SEAM_MM;
    expect(drawn).toBeCloseTo(240, 1);
    for (const p of layer.pieces) expect(p.acrossMm * p.widthRatio).toBeGreaterThanOrEqual(p.minAcrossMm - 1e-6);
    // The piece with the larger compressible range gives more.
    const [a, b] = layer.pieces;
    expect(150 - a.acrossMm * a.widthRatio).toBeGreaterThan(150 - b.acrossMm * b.widthRatio);
  });

  it("is over when even the minimums do not fit, and every piece sits at its floor", () => {
    const layer = fitLayer([piece(1, { widthMm: 150, minWidthMm: 130 }), piece(2, { widthMm: 150, minWidthMm: 130 })], 200);
    expect(layer.status).toBe("over");
    expect(layer.pieces.map((p) => p.acrossMm * p.widthRatio)).toEqual([130, 130]);
    expect(layer.minMm).toBe(260 + SEAM_MM);
  });

  it("squeezes a pouch lying along by its length, in the width's proportion", () => {
    const layer = fitLayer([piece(1, { widthMm: 200, lengthMm: 100, minWidthMm: 150, orientation: "along" })], 80);
    expect(layer.pieces[0].acrossMm).toBe(100);
    expect(layer.pieces[0].minAcrossMm).toBe(75);
    // 75 ≤ 80 < 100: squeezed to the budget, not over.
    expect(layer.status).toBe("compressed");
    expect(layer.pieces[0].acrossMm * layer.pieces[0].widthRatio).toBeCloseTo(80, 6);
    expect(fitLayer([piece(1, { widthMm: 200, lengthMm: 100, minWidthMm: 150, orientation: "along" })], 70).status).toBe("over");
  });
});

describe("fitCell", () => {
  const layers = [[piece(1, { thicknessMm: 40, minThicknessMm: 20 })], [piece(2, { thicknessMm: 40, minThicknessMm: 30 })], [piece(3, { thicknessMm: 40, minThicknessMm: 30 })]];

  it("is ok at or under the budget", () => {
    const cell = fitCell("left", "middle", layers, 260, 125);
    expect(cell.status).toBe("ok");
    expect(cell.loftMm).toBe(120);
    expect(cell.thicknessRatios).toEqual([1, 1, 1]);
  });

  it("shares a loft squeeze pro rata by each Layer's compressible range and sums exactly to the budget", () => {
    const cell = fitCell("left", "middle", layers, 260, 100);
    expect(cell.status).toBe("compressed");
    expect(cell.loftMm).toBe(100);
    const drawn = layers.map((l, d) => l[0].dims.thicknessMm * cell.thicknessRatios[d]);
    expect(drawn.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(drawn[0]).toBeLessThan(drawn[1]); // the 20 mm range gives twice what the 10 mm ranges give
    expect(drawn[1]).toBeCloseTo(drawn[2], 6);
  });

  it("is over below the fully compressed loft, drawing every Layer at its minimum", () => {
    const cell = fitCell("left", "middle", layers, 260, 70);
    expect(cell.status).toBe("over");
    expect(cell.loftMm).toBe(80);
    expect(cell.thicknessRatios.map((r, d) => r * layers[d][0].dims.thicknessMm)).toEqual([20, 30, 30]);
  });

  it("the same stack can be ok at a side Section and compressed at the centre", () => {
    // 2 × 80 = 160 mm: under the M side budget (153 × 1.1 = 168.3) and over the centre's (128 × 1.1 = 140.8).
    const stack = [[piece(1, { thicknessMm: 80, minThicknessMm: 30 })], [piece(2, { thicknessMm: 80, minThicknessMm: 30 })]];
    const m = PILLOW_DIMENSIONS.M;
    expect(fitCell("left", "middle", stack, m.sectionWidthsMm[0], m.maxLoftMm[0]).status).toBe("ok");
    expect(fitCell("center", "middle", stack, m.sectionWidthsMm[1], m.maxLoftMm[1]).status).toBe("compressed");
  });

  it("carries a Layer's width status up to the cell", () => {
    const wide = [[piece(1, { widthMm: 300, minWidthMm: 280 })]];
    expect(fitCell("left", "front", wide, 223, 200).status).toBe("over");
  });
});

describe("fitPillow", () => {
  const dims = new Map([resolved(1, { widthMm: 100, minWidthMm: 80, thicknessMm: 40, minThicknessMm: 25 }), resolved(2, { widthMm: 120, minWidthMm: 100, thicknessMm: 50, minThicknessMm: 30 })]);
  const placements: PillowPlacement[] = [at("center", "middle", 2, 2, 1), at("center", "middle", 1, 1, 0), at("left", "front", 1, 1), at("left", "front", 2, 2)];

  it("is input-order independent, byte-identical across calls, and summarises per Section", () => {
    const a = fitPillow(placements, { size: "M", dims });
    const b = fitPillow([...placements].reverse(), { size: "M", dims });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cells.map((c) => `${c.section}/${c.subSection}`)).toEqual(["left/front", "center/middle"]);
    expect(a.sections.center.loftBySubSection).toEqual({ front: 0, middle: 90, back: 0 });
    expect(a.sections.left.loftBySubSection.front).toBe(50);
    expect(a.sections.center.maxLoftMm).toBeCloseTo(128 * (1 + LOFT_ALLOWANCE), 1);
    expect(a.status).toBe("ok");
    expect(a.size).toBe("M");
  });

  it("budgets with the Settings allowance when given one and falls back to M for an unknown Size", () => {
    const tight = fitPillow(placements, { size: "xs", dims, loftAllowance: 0 });
    expect(tight.sections.left.maxLoftMm).toBe(101);
    expect(tight.loftAllowance).toBe(0);
    expect(fitPillow(placements, { size: null, dims }).size).toBe("M");
  });

  it("reports over when a stack cannot fit even compressed", () => {
    const thick = new Map([resolved(9, { thicknessMm: 80, minThicknessMm: 60 })]);
    const stack = [0, 1, 2].map((row) => at("center", "middle", row + 1, 9, row));
    const fit = fitPillow(stack, { size: "XS", dims: thick });
    expect(fit.status).toBe("over");
    expect(fit.cells[0].loftMm).toBe(180);
    expect(fit.sections.center.status).toBe("over");
  });
});

describe("wouldFit", () => {
  const dims = new Map([resolved(1, { widthMm: 100, minWidthMm: 80 }), resolved(2, { widthMm: 120, minWidthMm: 100 })]);

  it("equals fitPillow on the applied result, for an add and for a move", () => {
    const base: PillowPlacement[] = [at("left", "front", 1, 1)];
    const add = { kind: "add" as const, cell: { section: "left" as const, subSection: "front" as const }, itemId: 2, layer: null };
    const applied = addPiece(base, add.cell, add.itemId, add.layer);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const would = wouldFit(base, add, { size: "M", dims });
    expect(JSON.stringify(would.fit)).toBe(JSON.stringify(fitPillow(applied.placements, { size: "M", dims })));
    expect(would.cell?.subSection).toBe("front");

    const move = { kind: "move" as const, from: { section: "left" as const, subSection: "front" as const, slot: 1 }, to: { cell: { section: "right" as const, subSection: "back" as const }, layer: null } };
    const moved = applyFitChange(base, move);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ section: "right", subSection: "back", itemId: 1 });
    expect(JSON.stringify(wouldFit(base, move, { size: "M", dims }).fit)).toBe(JSON.stringify(fitPillow(moved, { size: "M", dims })));
  });

  it("puts an add into the topmost Layer with room, else a new Layer, without refusing", () => {
    const full = [1, 2, 3, 4, 5].map((slot) => at("left", "front", slot, 1, 0));
    const next = applyFitChange(full, { kind: "add", cell: { section: "left", subSection: "front" }, itemId: 2, layer: null });
    expect(next[next.length - 1]).toMatchObject({ slot: 6, row: 1 });
    // addPiece still refuses at the legacy caps before any fit is consulted.
    const capped = addPiece(
      [0, 1, 2, 3, 4].flatMap((row) => [1, 2, 3, 4, 5].map((slot) => at("left", "front", row * 5 + slot, 1, row))),
      { section: "left", subSection: "front" },
      2,
    );
    expect(capped.ok).toBe(false);
  });
});

describe("fitMessage", () => {
  it("names the cell, the three numbers and the Size", () => {
    const layers = [[piece(1, { thicknessMm: 40, minThicknessMm: 30 })], [piece(2, { thicknessMm: 30, minThicknessMm: 20 })], [piece(3, { thicknessMm: 25, minThicknessMm: 20 })]];
    const cell = fitCell("center", "middle", layers, 260, 60);
    expect(fitMessage(cell, "M")).toBe("center · middle: 3 layers need 95 mm relaxed, 70 mm fully compressed; Size M holds 60 mm");
    const wide = fitCell("left", "front", [[piece(1, { widthMm: 200, minWidthMm: 180 }), piece(2, { widthMm: 200, minWidthMm: 180 })]], 223, 200);
    expect(fitMessage(wide, "M")).toBe("left · front layer 1: 2 pieces need 402 mm relaxed, 362 mm fully squeezed; the left Section is 223 mm wide");
    expect(fitMessage(fitCell("right", "back", [[piece(1, {})]], 260, 200), "M")).toBe("right · back: fits");
  });
});

describe("layout reads the fit", () => {
  it("draws a compressed Layer at its squeezed widths and a compressed stack thinner", () => {
    const stage = stageGeometry("M");
    const dims = new Map([
      resolved(1, { widthMm: 150, minWidthMm: 100, thicknessMm: 80, minThicknessMm: 40 }),
      resolved(2, { widthMm: 150, minWidthMm: 130, thicknessMm: 80, minThicknessMm: 40 }),
    ]);
    const placements = [at("center", "middle", 1, 1, 0), at("center", "middle", 2, 2, 0), at("center", "middle", 3, 1, 1)];
    const fit = fitPillow(placements, { size: "M", dims });
    const layer = fit.cells[0].layers[0];
    expect(layer.status).toBe("compressed");
    const withFit = layoutPlacements(placements, { stage, dims, fit });
    const top = withFit.filter((p) => p.depth === 0).sort((p, q) => p.slot - q.slot);
    // A compressed Layer fills its cell wall to wall (a seam between the pieces).
    const frame = cellFrame("center", "middle", stage);
    expect(top[0].w + GAP + top[1].w).toBeCloseTo(frame.w, 0);
    // ...with the uneven squeeze the fit shared: the wider range gives more.
    const [a, b] = layer.pieces;
    expect(a.widthRatio).toBeLessThan(b.widthRatio);
    expect(top[0].w / top[1].w).toBeCloseTo((a.acrossMm * a.widthRatio) / (b.acrossMm * b.widthRatio), 2);
    expect(top[0].w).toBeCloseTo(a.widthRatio * 150 * stage.k, -1);
    // The top Layer draws at true scale: nothing above it foreshortens it.
    expect(top[0].h).toBeCloseTo(Math.min(GENERIC_POUCH.lengthMm * stage.k, frame.h), 1);
    // Thickness ratios shrink the depth offset compared with the unfitted layout.
    const withoutFit = layoutPlacements(placements, { stage, dims });
    const deepWith = withFit.find((p) => p.depth === 1)!;
    const deepWithout = withoutFit.find((p) => p.depth === 1)!;
    expect(deepWith.y).toBeLessThanOrEqual(deepWithout.y);
  });
});
