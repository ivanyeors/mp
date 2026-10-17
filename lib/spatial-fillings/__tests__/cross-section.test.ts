import { describe, expect, it } from "vitest";

import type { PillowPlacement } from "../core";
import { alongSlabs, crossSectionSlabs, cutLabel, DEFAULT_CUT, slabThicknessNote, type Cut } from "../cross-section";
import { GENERIC_POUCH, PILLOW_DIMENSIONS, type PouchDimensions, type ResolvedDims } from "../dimensions";
import { fitPillow } from "../fit";

const resolved = (id: number, dims: Partial<PouchDimensions>): [number, ResolvedDims] => [
  id,
  { key: `k${id}`, kind: "pouch", source: "measured", measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, ...dims } },
];
const at = (section: PillowPlacement["section"], subSection: PillowPlacement["subSection"], slot: number, itemId: number, row?: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId,
  ...(row === undefined ? {} : { row }),
});
const dims = new Map([resolved(1, { thicknessMm: 45, minThicknessMm: 25 }), resolved(2, { thicknessMm: 60, minThicknessMm: 40 })]);
const WALLED = { ...PILLOW_DIMENSIONS.M, subSectionDividers: true };
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe("crossSectionSlabs", () => {
  // Three layers left and right, one in the centre: "sides higher than center".
  const sideSleep: PillowPlacement[] = [
    ...[0, 1, 2].map((row) => at("left", "middle", row + 1, 1, row)),
    ...[0, 1, 2].map((row) => at("right", "middle", row + 1, 1, row)),
    at("center", "middle", 1, 1),
  ];

  it("along the left Section shows the middle stack, with mm that equal the fit's per-sub-section loft", () => {
    const fit = fitPillow(sideSleep, { size: "M", dims, pillow: WALLED });
    const cols = crossSectionSlabs(fit, { section: "left" });
    expect(cols.map((c) => c.key)).toEqual(["front", "middle", "back"]);
    expect(cols.map((c) => c.slabs.length)).toEqual([0, 3, 0]);
    for (const c of cols) {
      expect(sum(c.slabs.map((s) => s.heightMm))).toBeCloseTo(c.loftMm, 1);
      expect(c.loftMm).toBe(fit.sections.left.loftBySubSection[c.key]);
      expect(c.maxLoftMm).toBe(fit.sections.left.maxLoftMm);
    }
    expect(cols[1].loftMm).toBeGreaterThan(crossSectionSlabs(fit, DEFAULT_CUT)[1].loftMm);
    // Deepest plane at the bottom.
    expect(cols[1].slabs.map((s) => s.depth)).toEqual([2, 1, 0]);
  });

  it("never exceeds the loft line unless the column is over, and hatches compressed slabs", () => {
    const stack = [0, 1, 2].map((row) => at("center", "middle", row + 1, 2, row)); // 180 relaxed > 140.8, 120 min ≤ 140.8
    const compressed = crossSectionSlabs(fitPillow(stack, { size: "M", dims, pillow: WALLED }), DEFAULT_CUT)[1];
    expect(compressed.status).toBe("compressed");
    expect(sum(compressed.slabs.map((s) => s.heightMm))).toBeLessThanOrEqual(compressed.maxLoftMm + 0.1);
    expect(compressed.slabs.every((s) => s.hatched)).toBe(true);
    const four = [0, 1, 2, 3].map((row) => at("center", "middle", row + 1, 2, row)); // 160 min > 140.8
    const over = crossSectionSlabs(fitPillow(four, { size: "M", dims, pillow: WALLED }), DEFAULT_CUT)[1];
    expect(over.status).toBe("over");
    expect(sum(over.slabs.map((s) => s.heightMm))).toBeGreaterThan(over.maxLoftMm);
    expect(over.slabs.every((s) => s.status === "over")).toBe(true);
    const relaxed = crossSectionSlabs(fitPillow([at("left", "front", 1, 1)], { size: "M", dims, pillow: WALLED }), { section: "left" })[0];
    expect(relaxed.slabs).toEqual([{ depth: 0, heightMm: 45, itemId: 1, status: "ok", hatched: false }]);
  });

  it("a pouch settled across middle and back contributes its settled thickness to both columns", () => {
    const fit = fitPillow([at("center", "middle", 1, 1)], { size: "M", dims });
    const along: Cut = { section: "center" };
    const cols = crossSectionSlabs(fit, along);
    expect(cols.map((c) => c.key)).toEqual(["front", "middle", "back"]);
    expect(cols.map((c) => c.widthMm)).toEqual([fit.settle.cellLengthMm, fit.settle.cellLengthMm, fit.settle.cellLengthMm]);
    expect(cols[1].loftMm).toBeLessThan(45);
    expect(cols[2].loftMm).toBe(cols[1].loftMm);
    expect(cols[0].loftMm).toBe(cols[1].loftMm);
    expect(cols[2].slabs[0].itemId).toBe(1);
    // Walled, the same recipe is one tall column and two gaps.
    const walled = crossSectionSlabs(fitPillow([at("center", "middle", 1, 1)], { size: "M", dims, pillow: WALLED }), along);
    expect(walled.map((c) => c.loftMm)).toEqual([0, 45, 0]);
    expect(walled[0].slabs).toEqual([]);
  });

  it("colours a plane by the piece that sets its thickness and labels the cut", () => {
    const fit = fitPillow([at("left", "front", 1, 1), at("left", "front", 2, 2)], { size: "M", dims, pillow: WALLED });
    const [left] = crossSectionSlabs(fit, { section: "left" });
    expect(left.slabs).toHaveLength(1);
    expect(left.slabs[0].itemId).toBe(2);
    expect(left.slabs[0].heightMm).toBe(60);
    expect(cutLabel(DEFAULT_CUT)).toBe("along · center");
  });

  it("is deterministic for a given fit", () => {
    const fit = fitPillow(sideSleep, { size: "L", dims });
    expect(JSON.stringify(crossSectionSlabs(fit, DEFAULT_CUT))).toBe(JSON.stringify(crossSectionSlabs(fit, DEFAULT_CUT)));
  });
});

describe("the along cut's thickness, from Settings to the drawing", () => {
  const configured = new Map<number, ResolvedDims>([
    [1, { key: "6d/s", kind: "pouch", source: "configured", measuredOn: "2026-10-10", dims: { ...GENERIC_POUCH, thicknessMm: 45, minThicknessMm: 25 } }],
  ]);

  it("carries each pouch's thickness at the Size, then settled, then as drawn", () => {
    // XS: thickness scales by the side gusset, 101 / 153.
    const fit = fitPillow([at("center", "middle", 1, 1)], { size: "XS", dims: configured });
    const [slab] = alongSlabs(fit, "center");
    expect(slab.relaxedMm).toBeCloseTo(45 * (101 / 153), 0);
    expect(slab.settledMm).toBeLessThan(slab.relaxedMm); // alone in the Section: it spreads front and back
    expect(slab.heightMm).toBe(slab.settledMm);
  });

  it("explains a drawn height in the order it is derived", () => {
    const fit = fitPillow([at("center", "middle", 1, 1)], { size: "XS", dims: configured });
    const [slab] = alongSlabs(fit, "center");
    const note = slabThicknessNote(slab, fit.size, configured.get(1));
    expect(note).toMatch(/^\d+ mm drawn: 45 mm for Size M \(Settings\) → 30 mm at Size XS → \d+ mm spread along the Section$/);
    const fallback = { key: "6d/s", kind: "pouch" as const, source: "fallback" as const, measuredOn: null, dims: { ...GENERIC_POUCH } };
    expect(slabThicknessNote(slab, fit.size, fallback)).toContain("(not in Settings — family default)");
    const atM = fitPillow([at("left", "front", 1, 1)], { size: "M", dims: configured, pillow: WALLED });
    const [relaxed] = alongSlabs(atM, "left");
    expect(slabThicknessNote(relaxed, atM.size, configured.get(1))).toBe("45 mm drawn: 45 mm for Size M (Settings)");
  });

  it("says when a stack is squeezed to close", () => {
    const stackOf = [0, 1, 2].map((row) => at("center", "middle", row + 1, 2, row));
    const fit = fitPillow(stackOf, { size: "M", dims, pillow: WALLED });
    const [deepest] = alongSlabs(fit, "center");
    expect(slabThicknessNote(deepest, fit.size)).toMatch(/→ \d+ mm squeezed to close$/);
  });
});
