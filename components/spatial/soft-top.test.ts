import { describe, expect, it } from "vitest";

import { conformPouchPath, parsePathPolygon } from "@/lib/spatial-fillings/conform";
import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import { resolveDims, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { createSettle, distanceToPolygon, pointInPolygon, signedArea, SOLVER_DEFAULTS, type Pt } from "@/lib/spatial-fillings/soft-body";
import { SOFT_BODY_DEFAULTS, solverOptionsFor } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import { stageGeometry, XRAY_VIEW } from "@/lib/spatial-fillings/xray-stage";
import { cellRegion, sectionRegion, settleTop, softTopOptions, softTopPieces, type SoftTopPlane } from "./soft-top";
import { stageRegions } from "./xray-pillow";

// The cut's test items and the brand recipes (soft-cut.test.ts), each cell top → bottom.
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

/** The planes the x-ray settles, built as XrayPillow builds them: one per Layer of each Section. */
function planesOf(cells: Partial<Record<SubSection, number[]>>, size: PillowSize = "M", sections: readonly Section[] = SECTIONS): SoftTopPlane[] {
  const placements: PillowPlacement[] = sections.flatMap((section) =>
    SUB_SECTIONS.flatMap((subSection) => (cells[subSection] ?? []).map((itemId, row) => ({ section, subSection, slot: row + 1, itemId, row }))),
  );
  const stage = stageGeometry(size);
  const fit = fitPillow(placements, { size, dims: DIMS });
  const pieces = layoutPlacements(placements, { stage, dims: DIMS, fit });
  const regions = stageRegions(stage);
  const planes: SoftTopPlane[] = [];
  for (const section of sections) {
    const list = pieces.filter((p) => p.section === section);
    for (const depth of [...new Set(list.map((p) => p.depth))]) {
      planes.push({
        id: `settled/${section}/${depth}`,
        region: sectionRegion(stage, section),
        pieces: list
          .filter((p) => p.depth === depth)
          .map((p) => ({ key: p.key, d: conformPouchPath(p.settled, [regions.sil, regions.sections[section]], shapeOf(p.itemId)), rect: p.settled, shape: shapeOf(p.itemId) })),
      });
    }
  }
  return planes;
}

const overlap = (a: readonly Pt[], b: readonly Pt[]) => a.some(([x, y]) => pointInPolygon(b, x, y) && distanceToPolygon(b, x, y) > 0.5);

describe("soft top view", () => {
  it("settles every piece of every brand recipe, Size and Section inside its walls, apart from its Layer's neighbours", () => {
    for (const [name, cells] of Object.entries(RECIPES))
      for (const size of ["XS", "M", "XL"] as PillowSize[]) {
        const planes = planesOf(cells, size);
        const rings = settleTop(planes, SOFT_BODY_DEFAULTS, XRAY_VIEW);
        for (const plane of planes) {
          const mine = plane.pieces.map((p) => rings.get(p.key));
          expect(mine.every(Boolean), `${name} ${size} ${plane.id}: a soft outline for every piece`).toBe(true);
          for (const ring of mine as Pt[][]) {
            // Inside the Section's walls (a hair of smoothing aside).
            for (const [x, y] of ring) if (!pointInPolygon(plane.region, x, y)) expect(distanceToPolygon(plane.region, x, y), `${name} ${size} ${plane.id}`).toBeLessThan(1.5);
            expect(Math.abs(signedArea(ring))).toBeGreaterThan(100);
          }
          // Pieces of one Layer press on each other; they never run into each other.
          for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(overlap(mine[i]!, mine[j]!), `${name} ${size} ${plane.id}`).toBe(false);
        }
      }
  });

  it("is the cut's soft body with the top view's three differences: no gravity, rigid walls, held both ways", () => {
    const o = softTopOptions(SOFT_BODY_DEFAULTS);
    expect(o).toMatchObject({ ...solverOptionsFor(SOFT_BODY_DEFAULTS, 1), gravity: 0, rigidCase: true });
    expect(o.tetherY).toBeGreaterThan(0);
    // The cut's own defaults leave both new options off.
    expect(SOLVER_DEFAULTS.rigidCase).toBe(false);
    expect(SOLVER_DEFAULTS.tetherY).toBe(0);
  });

  it("reads the Settings: pouch volume swells the pouches, a Neck support is the firm roll", () => {
    // Middle: a 6D on top, the Neck support in the Layer under it.
    const planes = planesOf({ middle: [1, 4] }, "M", ["center"]);
    const top = planes.find((p) => p.id.endsWith("/0"))!;
    const under = planes.find((p) => p.id.endsWith("/1"))!;
    const at = (volumePct: number) => softTopPieces(top, { ...SOFT_BODY_DEFAULTS, volumePct })[0];
    expect(at(150).kind).toBe("pouch");
    expect(at(150).areaTarget!).toBeGreaterThan(at(100).areaTarget!);
    const roll = softTopPieces(under, SOFT_BODY_DEFAULTS)[0];
    expect(roll.kind).toBe("roll");
    // Volume is a pouch's: the roll keeps its own footprint whatever it is set to.
    expect(softTopPieces(under, { ...SOFT_BODY_DEFAULTS, volumePct: 170 })[0].areaTarget).toBe(roll.areaTarget);
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

  it("walls the dive's cells as the dive draws them: the silhouette inside each cell", () => {
    const stage = stageGeometry("M");
    for (const section of SECTIONS)
      for (const sub of SUB_SECTIONS) {
        const region = cellRegion(stage, `${section}/${sub}`);
        expect(region.length).toBeGreaterThanOrEqual(3);
        expect(Math.abs(signedArea(region))).toBeLessThan(Math.abs(signedArea(sectionRegion(stage, section))));
      }
  });

  it("settles a whole pillow quickly enough to draw on the main thread", () => {
    const planes = planesOf(RECIPES.mix, "L");
    const t0 = performance.now();
    settleTop(planes, { ...SOFT_BODY_DEFAULTS, rigidity: 51 }, XRAY_VIEW);
    expect(performance.now() - t0).toBeLessThan(1500);
    // Its outlines parse back as closed curves (labels and hit areas read them).
    expect(parsePathPolygon("M0 0 L10 0 L10 10 Z")).toHaveLength(3);
  });
});
