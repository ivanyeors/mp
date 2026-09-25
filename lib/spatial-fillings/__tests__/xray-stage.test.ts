import { describe, expect, it } from "vitest";

import { PILLOW_DIMENSIONS, PILLOW_SIZES, GENERIC_POUCH, type ResolvedDims } from "../dimensions";
import { stageGeometry, XRAY_VIEW } from "../xray-stage";
import { cellFrame, layoutPlacements } from "../xray-layout";
import type { PillowPlacement } from "../core";

const bbox = (pts: readonly (readonly [number, number])[]) => ({
  minX: Math.min(...pts.map((p) => p[0])),
  maxX: Math.max(...pts.map((p) => p[0])),
  minY: Math.min(...pts.map((p) => p[1])),
  maxY: Math.max(...pts.map((p) => p[1])),
});

const resolved = (dims: Partial<ResolvedDims["dims"]>, key = "test"): ResolvedDims => ({
  key,
  kind: "pouch",
  source: "measured",
  measuredOn: "2026-10-01",
  dims: { ...GENERIC_POUCH, ...dims },
});

describe("stageGeometry", () => {
  it("scales the registry outline to the stage width for every Size, front edge at the top", () => {
    for (const size of PILLOW_SIZES) {
      const stage = stageGeometry(size);
      const dims = PILLOW_DIMENSIONS[size];
      expect(stage.k).toBeCloseTo(XRAY_VIEW.width / dims.widthMm, 6);
      const b = bbox(stage.silhouettePolygon);
      expect(b.minX).toBeCloseTo(0, 0);
      expect(b.maxX).toBeCloseTo(XRAY_VIEW.width, 0);
      expect(b.maxY - b.minY).toBeCloseTo(dims.lengthMm * stage.k, 0);
      expect(b.minY).toBeCloseTo(stage.offsetY, 0);
      expect(b.maxY).toBeLessThanOrEqual(XRAY_VIEW.height + 0.1);
      // The notched front edge (max y in mm) is the TOP of the stage: the
      // silhouette's topmost vertex comes from the outline's front-most one.
      const frontMm = dims.outline.reduce((a, p) => (p[1] > a[1] ? p : a));
      const idx = dims.outline.indexOf(frontMm);
      expect(stage.silhouettePolygon[idx][1]).toBeCloseTo(b.minY, 0);
      expect(stage.silhouettePath).toMatch(/^M[\d.\- ]+( L[\d.\- ]+)+ Z$/);
    }
  });

  it("puts the Section columns at the protector's divider seams × k", () => {
    const xs = stageGeometry("XS");
    expect(xs.colX[0]).toBe(0);
    expect(xs.colX[1]).toBeCloseTo(204 * xs.k, 1);
    expect(xs.colX[2]).toBeCloseTo((204 + 195) * xs.k, 1);
    expect(xs.colX[3]).toBe(XRAY_VIEW.width);
    const xl = stageGeometry("XL");
    expect(xl.colX[1]).toBeCloseTo(XRAY_VIEW.width / 3, 0);
    expect(xl.colX[2]).toBeCloseTo((2 * XRAY_VIEW.width) / 3, 0);
    // XS's centre column is narrower than its sides; XL's are thirds.
    expect(xs.colX[2] - xs.colX[1]).toBeLessThan(xs.colX[1]);
  });

  it("changes proportions with the Size and is built once per Size", () => {
    const xs = stageGeometry("XS");
    const xl = stageGeometry("XL");
    expect(xs.silhouettePath).not.toBe(xl.silhouettePath);
    expect(xs.rowY[3] - xs.rowY[0]).toBeGreaterThan(xl.rowY[3] - xl.rowY[0]);
    expect(stageGeometry("XS")).toBe(xs);
    expect(Object.keys(xs.cellClipPaths)).toHaveLength(9);
    for (const d of Object.values(xs.cellClipPaths)) expect(d).toMatch(/^M[\d.\- ]+(L[\d.\- ]+)+Z$/);
  });
});

const cell = (slot: number, itemId: number, row?: number): PillowPlacement => ({
  section: "center",
  subSection: "middle",
  slot,
  itemId,
  ...(row === undefined ? {} : { row }),
});

describe("layoutPlacements at true scale", () => {
  it("draws one pouch at widthMm × k by lengthMm × k, centred in its cell", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 150, lengthMm: 90, orientation: "across" })]]);
    const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
    expect(p.w).toBeCloseTo(150 * stage.k, 1);
    expect(p.h).toBeCloseTo(90 * stage.k, 1);
    const frame = cellFrame("center", "middle", stage);
    expect(p.x + p.w / 2).toBeCloseTo(frame.x + frame.w / 2, 0);
    expect(p.y + p.h / 2).toBeCloseTo(frame.y + frame.h / 2, 0);
  });

  it("swaps the axes for a pouch that lies along the Section", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 100, lengthMm: 60, orientation: "along" })]]);
    const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
    expect(p.w).toBeCloseTo(60 * stage.k, 1);
    expect(p.h).toBeCloseTo(100 * stage.k, 1);
  });

  it("keeps two pouches that fit side by side at their footprints, a seam apart", () => {
    const stage = stageGeometry("M");
    const dims = new Map([
      [1, resolved({ widthMm: 100, lengthMm: 90 })],
      [2, resolved({ widthMm: 80, lengthMm: 90 })],
    ]);
    const [a, b] = layoutPlacements([cell(1, 1), cell(2, 2)], { stage, dims }).sort((p, q) => p.x - q.x);
    expect(a.w).toBeCloseTo(100 * stage.k, 1);
    expect(b.w).toBeCloseTo(80 * stage.k, 1);
    expect(b.x - (a.x + a.w)).toBeLessThanOrEqual(1.5);
  });

  it("clamps a layer wider than its cell pro rata, so nothing overflows yet", () => {
    const stage = stageGeometry("XS");
    const dims = new Map([
      [1, resolved({ widthMm: 200, lengthMm: 140 })],
      [2, resolved({ widthMm: 100, lengthMm: 140 })],
    ]);
    const layout = layoutPlacements([cell(1, 1), cell(2, 2)], { stage, dims });
    const frame = cellFrame("center", "middle", stage);
    for (const p of layout) {
      expect(p.x).toBeGreaterThanOrEqual(frame.x - 0.1);
      expect(p.x + p.w).toBeLessThanOrEqual(frame.x + frame.w + 0.1);
    }
    const [big, small] = [layout.find((p) => p.itemId === 1)!, layout.find((p) => p.itemId === 2)!];
    expect(big.w / small.w).toBeCloseTo(2, 1);
  });

  it("renders the same pouch larger on XS than on XL, in view units", () => {
    const dims = new Map([[1, resolved({ widthMm: 150, lengthMm: 90 })]]);
    const [xs] = layoutPlacements([cell(1, 1)], { stage: stageGeometry("XS"), dims });
    const [xl] = layoutPlacements([cell(1, 1)], { stage: stageGeometry("XL"), dims });
    expect(xs.w).toBeGreaterThan(xl.w);
    expect(xs.h).toBeGreaterThan(xl.h);
  });

  it("clamps a pouch longer than the cell to the cell height", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 100, lengthMm: 400 })]]);
    const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
    const frame = cellFrame("center", "middle", stage);
    expect(p.h).toBeCloseTo(frame.h, 0);
  });

  it("offsets deeper layers by the thickness above them, and keeps the deepest slab in the cell", () => {
    const stage = stageGeometry("M");
    const thin = new Map([[1, resolved({ widthMm: 100, lengthMm: 90, thicknessMm: 20 })]]);
    const thick = new Map([[1, resolved({ widthMm: 100, lengthMm: 90, thicknessMm: 80 })]]);
    const two = [cell(1, 1, 0), cell(2, 1, 1)];
    const deepThin = layoutPlacements(two, { stage, dims: thin }).find((p) => p.depth === 1)!;
    const deepThick = layoutPlacements(two, { stage, dims: thick }).find((p) => p.depth === 1)!;
    const topThin = layoutPlacements(two, { stage, dims: thin }).find((p) => p.depth === 0)!;
    expect(deepThin.y).toBeGreaterThan(topThin.y);
    expect(deepThick.y - topThin.y).toBeGreaterThan(deepThin.y - topThin.y);

    const five = [0, 1, 2, 3, 4].map((row) => cell(row + 1, 1, row));
    const layout = layoutPlacements(five, { stage, dims: thick });
    const frame = cellFrame("center", "middle", stage);
    for (const p of layout) {
      expect(p.y + p.h).toBeLessThanOrEqual(frame.y + frame.h + 0.1);
      expect(p.x + p.w).toBeLessThanOrEqual(frame.x + frame.w + 0.1);
      expect(p.h).toBeGreaterThan(0);
    }
    const deepest = layout.find((p) => p.depth === 4)!;
    expect(deepest.h).toBeGreaterThanOrEqual(frame.h * 0.4);
  });

  it("is order-independent and byte-identical across calls with a context", () => {
    const stage = stageGeometry("L");
    const dims = new Map([
      [1, resolved({ widthMm: 100, lengthMm: 90 })],
      [2, resolved({ widthMm: 120, lengthMm: 90 })],
    ]);
    const placements: PillowPlacement[] = [cell(2, 2), cell(1, 1), { section: "left", subSection: "back", slot: 1, itemId: 2 }];
    const a = layoutPlacements(placements, { stage, dims });
    expect(layoutPlacements([...placements].reverse(), { stage, dims })).toEqual(a);
    expect(layoutPlacements(placements, { stage, dims })).toEqual(a);
  });
});
