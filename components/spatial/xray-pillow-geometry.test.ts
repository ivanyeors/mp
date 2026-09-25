import { describe, expect, it } from "vitest";

import {
  CELL_POLYGONS,
  SHELL_SEAM,
  SILHOUETTE_POLYGON,
  type CellKey,
} from "@/components/spatial/xray-assets";
import { conformPouchPath, makeRegion, type ConformRegion } from "@/lib/spatial-fillings/conform";
import { GAP, layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

/**
 * The renderer used to `pieces.filter(...)` inside `cellsInUse.map(...)` and call
 * `conformPouchPath` per piece per render. It now groups once and memoises the
 * conformed outlines. These tests pin the two properties that makes safe: the
 * grouping reproduces the filter exactly, and the conform is invariant to the
 * region array being shared across a cell instead of rebuilt per piece.
 */

const SIL_REGION = makeRegion(SILHOUETTE_POLYGON, SHELL_SEAM);
const CELL_REGIONS = Object.fromEntries(
  (Object.entries(CELL_POLYGONS) as Array<[CellKey, typeof SILHOUETTE_POLYGON]>).map(
    ([key, poly]) => [key, makeRegion(poly, GAP)],
  ),
) as Record<CellKey, ConformRegion>;

const PLACEMENTS: PillowPlacement[] = [
  { section: "left", subSection: "front", slot: 0, itemId: 1 },
  { section: "left", subSection: "front", slot: 1, itemId: 2 },
  { section: "center", subSection: "middle", slot: 0, itemId: 3, row: 0 },
  { section: "center", subSection: "middle", slot: 1, itemId: 4, row: 1 },
  { section: "right", subSection: "back", slot: 0, itemId: 5 },
  { section: "right", subSection: "back", slot: 1, itemId: 5 },
  { section: "right", subSection: "back", slot: 2, itemId: 6 },
];

const pieces = layoutPlacements(PLACEMENTS);

function groupByCell() {
  const byCell = new Map<CellKey, typeof pieces>();
  for (const p of pieces) {
    const key = `${p.section}/${p.subSection}` as CellKey;
    const list = byCell.get(key);
    if (list) list.push(p);
    else byCell.set(key, [p]);
  }
  return byCell;
}

describe("xray-pillow piece grouping", () => {
  it("has some geometry to compare", () => {
    expect(pieces.length).toBeGreaterThan(0);
  });

  it("matches the per-cell filter it replaced, cell for cell and in order", () => {
    const byCell = groupByCell();
    const cellsInUse = [...new Set(pieces.map((p) => `${p.section}/${p.subSection}` as CellKey))];
    expect([...byCell.keys()]).toEqual(cellsInUse);
    for (const key of cellsInUse) {
      const filtered = pieces.filter((p) => `${p.section}/${p.subSection}` === key);
      expect(byCell.get(key)).toEqual(filtered);
    }
  });

  it("gives every piece a unique key, so the path memo cannot collide", () => {
    expect(new Set(pieces.map((p) => p.key)).size).toBe(pieces.length);
  });
});

describe("conformPouchPath memoisation is byte-identical", () => {
  it("produces the same path whether regions are shared or rebuilt per piece", () => {
    const byCell = groupByCell();

    // Old shape: a fresh region array for every piece, recomputed every render.
    const perPiece = new Map<string, string>();
    for (const p of pieces) {
      const key = `${p.section}/${p.subSection}` as CellKey;
      perPiece.set(p.key, conformPouchPath(p, [SIL_REGION, CELL_REGIONS[key]]));
    }

    // New shape: one region array per cell, one conform per piece per change.
    const memoised = new Map<string, string>();
    for (const [key, cellPieceList] of byCell) {
      const regions = [SIL_REGION, CELL_REGIONS[key]];
      for (const p of cellPieceList) memoised.set(p.key, conformPouchPath(p, regions));
    }

    expect([...memoised.entries()].sort()).toEqual([...perPiece.entries()].sort());
    for (const d of memoised.values()) expect(d).toMatch(/^M[\d.\- ]+( L[\d.\- ]+)+ Z$/);
  });

  it("is pure: repeat calls on the same rect return the identical string", () => {
    const p = pieces[0]!;
    const key = `${p.section}/${p.subSection}` as CellKey;
    const regions = [SIL_REGION, CELL_REGIONS[key]];
    expect(conformPouchPath(p, regions)).toBe(conformPouchPath(p, regions));
  });

  it("does not mutate the regions it is handed", () => {
    const key = `${pieces[0]!.section}/${pieces[0]!.subSection}` as CellKey;
    const regions = [SIL_REGION, CELL_REGIONS[key]];
    const before = JSON.stringify(regions);
    for (const p of pieces) conformPouchPath(p, regions);
    expect(JSON.stringify(regions)).toBe(before);
  });
});

describe("a compressed piece still conforms inside its regions (slice 03)", () => {
  it("keeps every outline point inside the silhouette and the cell after the fit squeezes it", async () => {
    const { fitPillow } = await import("@/lib/spatial-fillings/fit");
    const { GENERIC_POUCH } = await import("@/lib/spatial-fillings/dimensions");
    const { pointInPolygon } = await import("@/lib/spatial-fillings/conform");
    const dims = new Map([
      [1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, widthMm: 150, minWidthMm: 100 } }],
    ]);
    const crowded: PillowPlacement[] = [1, 2, 3].map((slot) => ({ section: "center", subSection: "middle", slot, itemId: 1 }));
    const fit = fitPillow(crowded, { size: "M", dims });
    expect(fit.status).not.toBe("ok");
    const laid = layoutPlacements(crowded, { dims, fit });
    const regions = [SIL_REGION, CELL_REGIONS["center/middle"]];
    for (const p of laid) {
      const d = conformPouchPath(p, regions);
      const pts = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const pt: [number, number] = [pts[i], pts[i + 1]];
        expect(pointInPolygon(pt, SILHOUETTE_POLYGON)).toBe(true);
        expect(pointInPolygon(pt, CELL_POLYGONS["center/middle"])).toBe(true);
      }
    }
  });
});
