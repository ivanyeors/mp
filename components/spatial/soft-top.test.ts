import { describe, expect, it } from "vitest";

import { conformPouchPath, parsePathPolygon } from "@/lib/spatial-fillings/conform";
import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import { neckAsPouch, resolveDims, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { createSettle, distanceToPolygon, pointInPolygon, signedArea, SOLVER_DEFAULTS, type Pt } from "@/lib/spatial-fillings/soft-body";
import { SOFT_BODY_DEFAULTS, solverOptionsFor } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import { stageGeometry, XRAY_VIEW } from "@/lib/spatial-fillings/xray-stage";
import { sectionRegion, settleTop, softTopOptions, softTopPieces, topPlanes, type SoftTopPlane } from "./soft-top";
import { stageRegions } from "./xray-pillow";

const ITEMS: Record<number, { name: string; subtype: string; category?: string }> = {
  1: { name: "6D (S)", subtype: "6D" },
  2: { name: "6D Fold (S)", subtype: "6D" },
  3: { name: "3D (S)", subtype: "3D" },
  4: { name: "Cervical Neck Support (M)", subtype: "Cervical Neck Support", category: "accessories" },
};
const DIMS = new Map<number, ResolvedDims>(Object.entries(ITEMS).map(([id, it]) => [Number(id), resolveDims({ name: it.name, category: it.category ?? "filling" })]));
const SUBTYPES = new Map(Object.entries(ITEMS).map(([id, it]) => [Number(id), it.subtype] as const));
const RECIPES: Record<string, Record<SubSection, number[]>> = {
  "8": { front: [1], middle: [2], back: [1, 1] },
  "11": { front: [1], middle: [1, 2], back: [3, 1, 1] },
  mix: { front: [1, 2], middle: [1, 4], back: [3, 1, 1] },
};
const shapeOf = (itemId: number) => fillingVisual(SUBTYPES.get(itemId) ?? null).shape;

function planesOf(cells: Partial<Record<SubSection, number[]>>, size: PillowSize = "M", sections: readonly Section[] = SECTIONS): SoftTopPlane[] {
  const placements: PillowPlacement[] = sections.flatMap((section) =>
    SUB_SECTIONS.flatMap((subSection) => (cells[subSection] ?? []).map((itemId, row) => ({ section, subSection, slot: row + 1, itemId, row }))),
  );
  const stage = stageGeometry(size);
  const fit = fitPillow(placements, { size, dims: DIMS });
  const pieces = layoutPlacements(placements, { stage, dims: DIMS, fit });
  const regions = stageRegions(stage);
  return topPlanes(
    stage,
    pieces.map((p) => ({
      key: p.key,
      section: p.section,
      level: p.level,
      d: conformPouchPath(p.settled, [regions.sil, regions.sections[p.section]], shapeOf(p.itemId)),
      rect: p.settled,
      shape: shapeOf(p.itemId),
      relaxedH: p.relaxedH,
    })),
    "settled",
  );
}

const overlap = (a: readonly Pt[], b: readonly Pt[]) => a.some(([x, y]) => pointInPolygon(b, x, y) && distanceToPolygon(b, x, y) > 0.5);

describe("soft top view", () => {
  it("settles every piece of every brand recipe, Size and Section inside its walls, apart from every other of its Layer", () => {
    for (const [name, cells] of Object.entries(RECIPES))
      for (const size of ["XS", "M", "XL"] as PillowSize[]) {
        const planes = planesOf(cells, size);
        const rings = settleTop(planes, SOFT_BODY_DEFAULTS, XRAY_VIEW);
        for (const plane of planes) {
          const mine = plane.pieces.map((p) => rings.get(p.key));
          expect(mine.every(Boolean), `${name} ${size} ${plane.id}: a soft outline for every piece`).toBe(true);
          for (const ring of mine as Pt[][]) {
            for (const [x, y] of ring) if (!pointInPolygon(plane.region, x, y)) expect(distanceToPolygon(plane.region, x, y), `${name} ${size} ${plane.id}`).toBeLessThan(1.5);
            expect(Math.abs(signedArea(ring))).toBeGreaterThan(100);
          }
          for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(overlap(mine[i]!, mine[j]!), `${name} ${size} ${plane.id}`).toBe(false);
        }
      }
  });

  it("is the cut's soft body with the top view's three differences: no gravity, rigid walls, held both ways", () => {
    const o = softTopOptions(SOFT_BODY_DEFAULTS);
    expect(o).toMatchObject({ ...solverOptionsFor(SOFT_BODY_DEFAULTS, 1), gravity: 0, rigidCase: true });
    expect(o.tetherY).toBeGreaterThan(0);
    expect(SOLVER_DEFAULTS.rigidCase).toBe(false);
    expect(SOLVER_DEFAULTS.tetherY).toBe(0);
  });

  it("reads the Settings: pouch volume swells the pouches, a Neck support is the firm roll", () => {
    const planes = planesOf({ middle: [1, 4] }, "M", ["center"]);
    const top = planes.find((p) => p.id.endsWith("/1"))!;
    const under = planes.find((p) => p.pieces.some((q) => q.shape === "pill"))!;
    expect(under.id).toBe("settled/center/0");
    const at = (volumePct: number) => softTopPieces(top, { ...SOFT_BODY_DEFAULTS, volumePct })[0];
    expect(at(150).kind).toBe("pouch");
    expect(at(150).areaTarget!).toBeGreaterThan(at(100).areaTarget!);
    const roll = softTopPieces(under, SOFT_BODY_DEFAULTS)[0];
    expect(roll.kind).toBe("roll");
    expect(softTopPieces(under, { ...SOFT_BODY_DEFAULTS, volumePct: 170 })[0].areaTarget).toBe(roll.areaTarget);
  });

  it("keeps a pouch nudged by hand where it was put: its neighbours make room", () => {
    const centreOf = (offset: { offsetXMm?: number; offsetYMm?: number }) => {
      const placements: PillowPlacement[] = SUB_SECTIONS.filter((subSection) => subSection !== "back").flatMap((subSection) =>
        RECIPES["11"][subSection].map((itemId, row) => ({ section: "center" as const, subSection, slot: row + 1, itemId, row, ...(subSection === "middle" && row === 0 ? offset : {}) })),
      );
      const stage = stageGeometry("M");
      const fit = fitPillow(placements, { size: "M", dims: DIMS });
      const pieces = layoutPlacements(placements, { stage, dims: DIMS, fit });
      const regions = stageRegions(stage);
      const list = pieces.filter((p) => p.depth === 0);
      const planes = topPlanes(
        stage,
        list.map((p) => ({
          key: p.key,
          section: p.section,
          level: p.level,
          d: conformPouchPath(p.settled, [regions.sil, regions.sections.center], shapeOf(p.itemId)),
          rect: p.settled,
          shape: shapeOf(p.itemId),
          held: p.nudged,
          relaxedH: p.relaxedH,
        })),
        "settled",
      );
      expect(planes.map((pl) => pl.id)).toEqual(["settled/center/0", "settled/center/1"]);
      const ring = settleTop(planes, SOFT_BODY_DEFAULTS, XRAY_VIEW).get("center/middle/1")!;
      const rect = list.find((p) => p.key === "center/middle/1")!.settled;
      return {
        soft: [ring.reduce((a, q) => a + q[0], 0) / ring.length / stage.k, ring.reduce((a, q) => a + q[1], 0) / ring.length / stage.k],
        rect: [(rect.x + rect.w / 2) / stage.k, (rect.y + rect.h / 2) / stage.k],
      };
    };
    const home = centreOf({});
    const back = centreOf({ offsetYMm: 20 });
    const left = centreOf({ offsetXMm: -20 });
    expect(Math.abs(back.rect[1] - home.rect[1] - 20)).toBeLessThan(1);
    expect(back.soft[1] - home.soft[1]).toBeGreaterThan(8);
    expect(left.soft[0] - home.soft[0]).toBeLessThan(-15);
  });

  it("draws a Neck support nudged across where it was put, against the centre's curved back wall", () => {
    const NECK = 9;
    const dims = new Map(DIMS).set(NECK, { key: "neck/l", kind: "neck", source: "configured", measuredOn: null, dims: neckAsPouch({ lengthMm: 150, radiusMm: 50, minRadiusMm: 35 }) });
    const stage = stageGeometry("S");
    const regions = stageRegions(stage);
    const drawnAt = (offsetXMm: number) => {
      const placements: PillowPlacement[] = [
        { section: "center", subSection: "front", slot: 1, itemId: 1 },
        { section: "center", subSection: "middle", slot: 1, itemId: 1 },
        { section: "center", subSection: "back", slot: 1, itemId: NECK, ...(offsetXMm ? { offsetXMm } : {}) },
      ];
      const pieces = layoutPlacements(placements, { stage, dims, fit: fitPillow(placements, { size: "S", dims }) });
      const plane: SoftTopPlane = {
        id: "settled/center/0",
        region: sectionRegion(stage, "center"),
        pieces: pieces.map((p) => {
          const shape = p.itemId === NECK ? "pill" : shapeOf(p.itemId);
          return { key: p.key, d: conformPouchPath(p.settled, [regions.sil, regions.sections.center], shape), rect: p.settled, shape, held: p.nudged };
        }),
      };
      const ring = settleTop([plane], SOFT_BODY_DEFAULTS, XRAY_VIEW).get("center/back/1")!;
      const xs = ring.map((q) => q[0]);
      const rect = pieces.find((p) => p.key === "center/back/1")!.settled;
      return { soft: (Math.min(...xs) + Math.max(...xs)) / 2, put: rect.x + rect.w / 2 };
    };
    const offsets = [-40, -20, -5, 0, 5, 20, 40];
    const drawn = offsets.map(drawnAt);
    for (const [i, d] of drawn.entries()) expect(Math.abs(d.soft - d.put), `nudged ${offsets[i]} mm`).toBeLessThan(2);
    for (let i = 1; i < drawn.length; i++) expect(drawn[i].soft).toBeGreaterThan(drawn[i - 1].soft);
  });

  it("is deterministic: the same recipe settles to the same outlines", () => {
    const planes = planesOf(RECIPES["11"], "M", ["center"]);
    const run = () => {
      const pieces = softTopPieces(planes[0], SOFT_BODY_DEFAULTS);
      const sim = createSettle(pieces, { outline: planes[0].region, baseline: XRAY_VIEW.height * 4, width: XRAY_VIEW.width, height: XRAY_VIEW.height }, softTopOptions(SOFT_BODY_DEFAULTS));
      sim.step(sim.steps);
      return JSON.stringify(sim.snapshot().bodies);
    };
    expect(run()).toBe(run());
  });

  it("stuffs Front, Middle and Back of one Layer against each other: pressed shorter, never laid over, pushing back", () => {
    const NECK = 9;
    const dims = new Map(DIMS).set(NECK, { key: "neck/l", kind: "neck", source: "configured", measuredOn: null, dims: neckAsPouch({ lengthMm: 500, radiusMm: 70, minRadiusMm: 40 }) });
    const placements: PillowPlacement[] = [
      { section: "center", subSection: "front", slot: 1, itemId: 1 },
      { section: "center", subSection: "middle", slot: 1, itemId: 2 },
      { section: "center", subSection: "back", slot: 1, itemId: NECK },
    ];
    const stage = stageGeometry("S");
    const regions = stageRegions(stage);
    const pieces = layoutPlacements(placements, { stage, dims, fit: fitPillow(placements, { size: "S", dims }) });
    const along = [...pieces].sort((a, b) => a.y - b.y);
    for (let i = 1; i < along.length; i++) expect(along[i].y).toBeGreaterThanOrEqual(along[i - 1].y + along[i - 1].h - 0.5);
    for (const p of along) {
      if (p.itemId === NECK) expect(p.relaxedH).toBe(p.h);
      else expect(p.relaxedH).toBeGreaterThan(p.h + 1);
    }
    const planes = topPlanes(
      stage,
      pieces.map((p) => {
        const shape = p.itemId === NECK ? "pill" : shapeOf(p.itemId);
        return { key: p.key, section: p.section, level: p.level, d: conformPouchPath(p.settled, [regions.sil, regions.sections.center], shape), rect: p.settled, shape, relaxedH: p.relaxedH };
      }),
      "settled",
    );
    expect(planes).toHaveLength(1);
    const soft = softTopPieces(planes[0], SOFT_BODY_DEFAULTS);
    const loose = softTopPieces({ ...planes[0], pieces: planes[0].pieces.map((p) => ({ ...p, relaxedH: undefined })) }, SOFT_BODY_DEFAULTS);
    expect(soft.find((q) => q.id === "center/front/1")!.areaTarget!).toBeGreaterThan(loose.find((q) => q.id === "center/front/1")!.areaTarget!);
    const rings = settleTop(planes, SOFT_BODY_DEFAULTS, XRAY_VIEW);
    const mine = planes[0].pieces.map((p) => rings.get(p.key)!);
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(overlap(mine[i], mine[j])).toBe(false);
  });

  it("settles a whole pillow quickly enough to draw on the main thread", () => {
    const planes = planesOf(RECIPES.mix, "L");
    const t0 = performance.now();
    settleTop(planes, { ...SOFT_BODY_DEFAULTS, rigidity: 51 }, XRAY_VIEW);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(parsePathPolygon("M0 0 L10 0 L10 10 Z")).toHaveLength(3);
  });
});
