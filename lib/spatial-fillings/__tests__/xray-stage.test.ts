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

describe("layoutPlacements draws true scale (28-9-2026: a small filling reads small)", () => {
  it("draws one pouch at its footprint × k, centred in its cell", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 150, lengthMm: 90, orientation: "across" })]]);
    const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
    const frame = cellFrame("center", "middle", stage);
    expect(p.w).toBeCloseTo(150 * stage.k, 0);
    expect(p.h).toBeCloseTo(90 * stage.k, 0);
    expect(p.x + p.w / 2).toBeCloseTo(frame.x + frame.w / 2, 0);
    expect(p.y + p.h / 2).toBeCloseTo(frame.y + frame.h / 2, 0);
  });

  it("a small pouch draws smaller than a large one by their registry sizes, and neither fills the cell", () => {
    const stage = stageGeometry("M");
    const dims = new Map([
      [1, resolved({ widthMm: 100, lengthMm: 90 })],
      [2, resolved({ widthMm: 50, lengthMm: 45 })],
    ]);
    const [large, small] = [1, 2].map((id) => layoutPlacements([cell(1, id)], { stage, dims })[0]);
    expect(small.w / large.w).toBeCloseTo(0.5, 1);
    expect(small.h / large.h).toBeCloseTo(0.5, 1);
    expect(large.w).toBeLessThan(cellFrame("center", "middle", stage).w);
  });

  it("sits a shared layer side by side, a seam apart, the row centred", () => {
    const stage = stageGeometry("M");
    const dims = new Map([
      [1, resolved({ widthMm: 100, lengthMm: 90 })],
      [2, resolved({ widthMm: 80, lengthMm: 90 })],
    ]);
    const [a, b] = layoutPlacements([cell(1, 1), cell(2, 2)], { stage, dims }).sort((p, q) => p.x - q.x);
    const frame = cellFrame("center", "middle", stage);
    expect(a.w / b.w).toBeCloseTo(100 / 80, 1);
    expect(b.x - (a.x + a.w)).toBeLessThanOrEqual(1.5);
    expect((a.x + b.x + b.w) / 2).toBeCloseTo(frame.x + frame.w / 2, 0);
  });

  it("weighs a pouch that lies along the Section by its length across", () => {
    const stage = stageGeometry("M");
    const dims = new Map([
      [1, resolved({ widthMm: 100, lengthMm: 60, orientation: "along" })],
      [2, resolved({ widthMm: 120, lengthMm: 60, orientation: "across" })],
    ]);
    const [along, across] = layoutPlacements([cell(1, 1), cell(2, 2)], { stage, dims }).sort((p, q) => p.x - q.x);
    expect(along.w / across.w).toBeCloseTo(60 / 120, 1);
  });

  it("never overflows a cell: a layer wider than it shares the width pro rata", () => {
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

  it("a pouch keeps its proportion to the pillow at every Size — the stage is the pillow, the pouch scales with it", () => {
    const dims = new Map([[1, resolved({ widthMm: 150, lengthMm: 90 })]]);
    const at = (size: "XS" | "M" | "XL") => {
      const stage = stageGeometry(size);
      const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
      const body = stage.rowY[3] - stage.rowY[0];
      return { w: p.w / XRAY_VIEW.width, h: p.h / body };
    };
    const m = at("M");
    expect(m.w).toBeCloseTo(150 / PILLOW_DIMENSIONS.M.widthMm, 2);
    for (const size of ["XS", "XL"] as const) {
      expect(at(size).w).toBeCloseTo(m.w, 2);
      expect(at(size).h).toBeCloseTo(m.h, 2);
    }
  });

  it("cuts a pouch longer than its cell to the cell", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 100, lengthMm: 400 })]]);
    const [p] = layoutPlacements([cell(1, 1)], { stage, dims });
    const frame = cellFrame("center", "middle", stage);
    expect(p.h).toBeCloseTo(frame.h, 0);
  });

  it("moves a pouch by its fine offset from home, and clamps it to the free space in its cell", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 60, lengthMm: 50 })]]);
    const [home] = layoutPlacements([cell(1, 1)], { stage, dims });
    const [moved] = layoutPlacements([{ ...cell(1, 1), offsetXMm: -10, offsetYMm: 5 }], { stage, dims });
    expect(moved.x - home.x).toBeCloseTo(-10 * stage.k, 0);
    expect(moved.y - home.y).toBeCloseTo(5 * stage.k, 0);
    expect({ x: home.home.x, y: home.home.y }).toEqual({ x: home.x, y: home.y });
    const [far] = layoutPlacements([{ ...cell(1, 1), offsetXMm: -200, offsetYMm: 200 }], { stage, dims });
    const frame = cellFrame("center", "middle", stage);
    expect(far.x).toBeCloseTo(frame.x, 0);
    expect(far.y + far.h).toBeCloseTo(frame.y + frame.h, 0);
    expect(far.x).toBeCloseTo(far.range.minX, 1);
    expect(far.y).toBeCloseTo(far.range.maxY, 1);
  });

  it("an offset is M millimetres: it moves a pouch the same fraction of the pillow at every Size", () => {
    const dims = new Map([[1, resolved({ widthMm: 60, lengthMm: 50 })]]);
    const shift = (size: "XS" | "M" | "XL") => {
      const stage = stageGeometry(size);
      const [home] = layoutPlacements([cell(1, 1)], { stage, dims });
      const [moved] = layoutPlacements([{ ...cell(1, 1), offsetXMm: 20 }], { stage, dims });
      return (moved.x - home.x) / XRAY_VIEW.width;
    };
    expect(shift("XS")).toBeCloseTo(shift("M"), 3);
    expect(shift("XL")).toBeCloseTo(shift("M"), 3);
  });

  it("a pouch nudged into its neighbour pushes it along — order and seams hold", () => {
    const stage = stageGeometry("M");
    const dims = new Map([[1, resolved({ widthMm: 50, lengthMm: 50 })]]);
    const [a, b] = layoutPlacements([{ ...cell(1, 1), offsetXMm: 150 }, cell(2, 1)], { stage, dims }).sort((p, q) => p.slot - q.slot);
    const frame = cellFrame("center", "middle", stage);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w);
    expect(b.x + b.w).toBeLessThanOrEqual(frame.x + frame.w + 0.1);
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
