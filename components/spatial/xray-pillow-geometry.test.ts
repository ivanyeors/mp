import { describe, expect, it } from "vitest";

import {
  CELL_POLYGONS,
  SECTION_POLYGONS,
  SHELL_SEAM,
  SILHOUETTE_POLYGON,
  type CellKey,
} from "@/components/spatial/xray-assets";
import { conformPouchPath, makeRegion, type ConformRegion } from "@/lib/spatial-fillings/conform";
import { cellFrame, GAP, layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

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

    const perPiece = new Map<string, string>();
    for (const p of pieces) {
      const key = `${p.section}/${p.subSection}` as CellKey;
      perPiece.set(p.key, conformPouchPath(p, [SIL_REGION, CELL_REGIONS[key]]));
    }

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

describe("a settled piece conforms against silhouette ∩ Section (slice 11)", () => {
  it("a pouch longer than its cell reaches past its cell's edges at its own length, yet stays inside its Section", async () => {
    const { fitPillow } = await import("@/lib/spatial-fillings/fit");
    const { GENERIC_POUCH } = await import("@/lib/spatial-fillings/dimensions");
    const { pointInPolygon } = await import("@/lib/spatial-fillings/conform");
    const dims = new Map([
      [1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH } }],
    ]);
    const alone: PillowPlacement[] = [{ section: "center", subSection: "middle", slot: 1, itemId: 1 }];
    const fit = fitPillow(alone, { size: "M", dims });
    const [p] = layoutPlacements(alone, { dims, fit });
    expect(p.settled).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
    expect(p.h).toBeGreaterThan(cellFrame("center", "middle").h);
    const SECTION_REGION = makeRegion(SECTION_POLYGONS.center, GAP);
    const settled = conformPouchPath(p.settled, [SIL_REGION, SECTION_REGION]);
    const ring = (d: string) => {
      const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      return pts;
    };
    let outsideCell = 0;
    for (const pt of ring(settled)) {
      expect(pointInPolygon(pt, SILHOUETTE_POLYGON)).toBe(true);
      expect(pointInPolygon(pt, SECTION_POLYGONS.center)).toBe(true);
      if (!pointInPolygon(pt, CELL_POLYGONS["center/middle"])) outsideCell++;
    }
    expect(outsideCell).toBeGreaterThan(0);
  });
});
