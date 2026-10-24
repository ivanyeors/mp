import { describe, expect, it } from "vitest";

import { SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import { CODE_REGISTRY, resolveDims, type DimensionRegistry, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { createSettle, distanceToPolygon, pointInPolygon, resample, ringLength, signedArea, smoothSnapshot, type Pt } from "@/lib/spatial-fillings/soft-body";
import { SOFT_BODY_DEFAULTS } from "@/lib/spatial-fillings/soft-body-settings";
import { morph, rollRing, seedShapes, settleSoftCut, softCutScene, type SoftCutInput } from "./soft-cut";
import { softCutInputFor } from "./xray-cross-section";

// The testing preview's items and the brand diagrams' recipes (Oct 2026), each cell top → bottom.
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
  "8A": { front: [1], middle: [2], back: [3, 1, 1] },
  "9": { front: [1], middle: [1, 2], back: [3, 1] },
  "9A": { front: [1], middle: [1, 2], back: [1, 1] },
  "11": { front: [1], middle: [1, 2], back: [3, 1, 1] },
  mix: { front: [1, 2], middle: [1, 4], back: [3, 1, 1] },
};
const SIZES: PillowSize[] = ["XS", "S", "M", "L", "XL"];

function placementsOf(cells: Partial<Record<SubSection, number[]>>, section: Section = "center"): PillowPlacement[] {
  return SUB_SECTIONS.flatMap((subSection) => (cells[subSection] ?? []).map((itemId, row) => ({ section, subSection, slot: row + 1, itemId, row })));
}
function inputOf(cells: Partial<Record<SubSection, number[]>>, size: PillowSize = "M", section: Section = "center", compact = false): SoftCutInput {
  const fit = fitPillow(placementsOf(cells, section), { size, dims: DIMS });
  return softCutInputFor(fit, { section }, { compact, itemSubtypes: SUBTYPES });
}
function settleFresh(input: SoftCutInput, split?: number) {
  const scene = softCutScene(input);
  const sim = createSettle(scene.pieces, scene.frame, scene.options);
  if (split) while (!sim.step(split));
  else sim.step(sim.steps);
  return sim.snapshot();
}

/** How often an outline's bend flips direction, and how jittery its bend is (the preview's wobble metric). */
function wobble(ring: readonly Pt[], skip?: (p: Pt) => boolean) {
  let len = 0;
  for (let i = 0; i < ring.length; i++) len += Math.hypot(ring[(i + 1) % ring.length][0] - ring[i][0], ring[(i + 1) % ring.length][1] - ring[i][1]);
  const P = resample(ring, Math.max(24, Math.round(len / 4)));
  const th = P.map((p, i) => {
    const a = P[(i - 1 + P.length) % P.length];
    const b = P[(i + 1) % P.length];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  });
  let flips = 0, rough = 0, n = 0, last = 0;
  for (let i = 0; i < th.length; i++) {
    if (skip?.(P[i])) {
      last = 0;
      continue;
    }
    if (Math.abs(th[i]) > 0.02) {
      const s = Math.sign(th[i]);
      if (last && s !== last) flips++;
      last = s;
    }
    const d2 = th[(i + 1) % th.length] - 2 * th[i] + th[(i - 1 + th.length) % th.length];
    rough += d2 * d2;
    n++;
  }
  return { flips, rough: Math.sqrt(rough / Math.max(n, 1)) };
}

describe("soft cut", () => {
  it("is deterministic, and how the steps are split never changes the picture", () => {
    const input = inputOf(RECIPES["11"]);
    const once = settleFresh(input);
    expect(settleFresh(input)).toEqual(once);
    expect(settleFresh(input, 1)).toEqual(once);
    expect(settleFresh(input, 7)).toEqual(once);
  });

  it("stacks from the back panel up: a cell's deepest Layer is its lowest piece, and nothing floats", () => {
    for (const [name, cells] of Object.entries(RECIPES)) {
      for (const size of SIZES) {
        const input = inputOf(cells, size);
        const shapes = settleSoftCut(input);
        const gap = input.settings.gap * input.frame.scale;
        const rings = [...new Map([...shapes.rings].map(([k, r]) => [r, k])).keys()];
        for (const ring of rings) {
          // It rests on something: somewhere under it, the floor or another piece is within a few gaps.
          const clearance = (p: Pt) => {
            let below = input.frame.floor;
            for (const other of rings) {
              if (other === ring) continue;
              for (let i = 0; i < other.length; i++) {
                const a = other[i];
                const b = other[(i + 1) % other.length];
                if ((a[0] - p[0]) * (b[0] - p[0]) > 0 || a[0] === b[0]) continue;
                const y = a[1] + ((p[0] - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
                if (y > p[1] - 0.5 && y < below) below = y;
              }
            }
            return below - p[1];
          };
          expect(Math.min(...ring.map(clearance)), `${name} ${size}: a piece floats`).toBeLessThan(3 * gap + 2);
        }
        // Per cell, Layer 0 (the top) sits above the deeper ones.
        for (const sub of SUB_SECTIONS) {
          const stack = cells[sub];
          if (stack.length < 2) continue;
          const cy = (key: string) => {
            const r = shapes.rings.get(key)!;
            return r.reduce((a, p) => a + p[1], 0) / r.length;
          };
          for (let row = 1; row < stack.length; row++) {
            expect(cy(`center/${sub}/${row}`), `${name} ${size} ${sub}`).toBeLessThan(cy(`center/${sub}/${row + 1}`));
          }
        }
      }
    }
  });

  it("rests a pouch on the Neck support under it, and the firm roll gives only a little", () => {
    const input = inputOf(RECIPES.mix);
    const shapes = settleSoftCut(input);
    const pouch = shapes.rings.get("center/middle/1")!;
    const roll = shapes.rings.get("center/middle/2")!;
    const nearest = Math.min(...pouch.map((p) => distanceToPolygon(roll, p[0], p[1])));
    expect(nearest).toBeLessThan(input.settings.gap * input.frame.scale + 2);
    const xs = roll.map((p) => p[0]);
    const ys = roll.map((p) => p[1]);
    const aspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    expect(aspect).toBeGreaterThan(1);
    expect(aspect).toBeLessThan(1.2);
  });

  it("lets a soft Neck support share a crowded cell: it squashes toward fully squashed, and the pouch on it keeps more cushion", () => {
    // A Neck support as big as Staff measure it, filling the middle cell past what the case holds.
    const registry: DimensionRegistry = { ...CODE_REGISTRY, neck: { ...CODE_REGISTRY.neck, M: { lengthMm: 300, radiusMm: 70, minRadiusMm: 40, measuredOn: "test" } } };
    const dims = new Map([...DIMS].map(([id]) => [id, resolveDims({ name: ITEMS[id].name, category: ITEMS[id].category ?? "filling" }, registry)] as const));
    const fit = fitPillow(placementsOf(RECIPES.mix), { size: "L", dims });
    const at = (neckFirmness: number) => {
      const input = softCutInputFor(fit, { section: "center" }, { itemSubtypes: SUBTYPES, settings: { ...SOFT_BODY_DEFAULTS, neckFirmness } });
      const shapes = settleSoftCut(input);
      const roll = shapes.rings.get("center/middle/2")!;
      const xs = roll.map((p) => p[0]);
      const ys = roll.map((p) => p[1]);
      return { input, shapes, aspect: (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)), height: (Math.max(...ys) - Math.min(...ys)) / input.frame.ky, pouch: Math.abs(signedArea(shapes.rings.get("center/middle/1")!)) };
    };
    const firm = at(100);
    const soft = at(0);
    // Fully firm, it is seeded round and keeps nearly round, as before softness reached the stack.
    expect(firm.aspect).toBeLessThan(1.15);
    expect(at(75).aspect).toBeLessThan(1.15);
    expect(soft.aspect).toBeGreaterThan(1.4);
    expect(soft.height).toBeLessThan(firm.height * 0.85);
    // Never below fully squashed: twice the squashed radius at this Size.
    const squashedMm = fit.settle.pieces.find((p) => p.key === "center/middle/2")!.minThicknessMm;
    expect(soft.height).toBeGreaterThan(squashedMm - 2);
    expect(soft.pouch).toBeGreaterThan(firm.pouch * 1.2);
    // Squashed, it still rests on the floor under the pouch, apart from its neighbours and inside the cloth.
    const { input, shapes } = soft;
    const rings = [...new Set(shapes.rings.values())];
    const roll = shapes.rings.get("center/middle/2")!;
    expect(input.frame.floor - Math.max(...roll.map((p) => p[1]))).toBeLessThan(input.settings.gap * input.frame.scale + 6);
    for (const ring of rings) {
      for (const p of ring) {
        if (!pointInPolygon(shapes.case, p[0], p[1])) expect(distanceToPolygon(shapes.case, p[0], p[1])).toBeLessThan(1.5);
      }
      for (const other of rings) {
        if (other === ring) continue;
        expect(ring.filter((p) => pointInPolygon(other, p[0], p[1]) && distanceToPolygon(other, p[0], p[1]) > 1).length).toBe(0);
      }
    }
  });

  it("seeds a squashed roll as a stadium as long round as its relaxed circle", () => {
    const round = rollRing(0, 0, 100, 100);
    const squashed = rollRing(0, 0, 100, 60);
    expect(round).toHaveLength(squashed.length);
    expect(ringLength(squashed) / ringLength(round)).toBeCloseTo(1, 2);
    const ys = squashed.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(60, 0);
    expect(Math.sign(signedArea(squashed))).toBe(Math.sign(signedArea(round)));
  });

  it("keeps pieces apart and inside the cloth, and the cloth inside its sewn outline", () => {
    for (const [name, cells] of Object.entries(RECIPES)) {
      const input = inputOf(cells, "M");
      const shapes = settleSoftCut(input);
      const sewn = input.casePolygon;
      // The cloth may billow 1.5 past its seam, and the drawn line, smoothed, within a unit of that.
      const billow = 1.5 * input.frame.scale;
      for (const p of shapes.case) {
        if (!pointInPolygon(sewn, p[0], p[1])) expect(distanceToPolygon(sewn, p[0], p[1]), `${name}: cloth past the seam`).toBeLessThan(billow + 1);
      }
      const rings = [...shapes.rings.values()];
      for (const ring of rings) {
        for (const p of ring) {
          if (!pointInPolygon(shapes.case, p[0], p[1])) expect(distanceToPolygon(shapes.case, p[0], p[1]), `${name}: a piece through the cloth`).toBeLessThan(1.5);
        }
        for (const other of rings) {
          if (other === ring) continue;
          const inside = ring.filter((p) => pointInPolygon(other, p[0], p[1]) && distanceToPolygon(other, p[0], p[1]) > 1);
          expect(inside.length, `${name}: two pieces overlap`).toBe(0);
        }
      }
    }
  });

  it("sags when under-filled and stands to its sewn height when full", () => {
    const top = (P: readonly Pt[]) => Math.min(...P.map((p) => p[1]));
    const one = inputOf({ middle: [1] });
    const full = inputOf(RECIPES["11"]);
    const sewnTop = top(one.casePolygon);
    const height = one.frame.baseline - sewnTop;
    expect(top(settleSoftCut(one).case) - sewnTop).toBeGreaterThan(0.3 * height);
    expect(top(settleSoftCut(full).case) - sewnTop).toBeLessThan(0.12 * height);
  });

  it("draws smooth outlines: no wobble on the pieces or the cloth", () => {
    let pouchRough = 0, caseRough = 0, caseFlips = 0, pieces = 0, scenes = 0;
    for (const cells of Object.values(RECIPES)) {
      for (const size of SIZES) {
        const input = inputOf(cells, size);
        const shapes = settleSoftCut(input);
        for (const ring of new Set(shapes.rings.values())) {
          pouchRough += wobble(ring).rough;
          pieces++;
        }
        const w = wobble(shapes.case, (p) => p[1] > input.frame.baseline - 0.6);
        caseRough += w.rough;
        caseFlips += w.flips;
        scenes++;
      }
    }
    // Measured Oct 2026: pouches 0.043, the cloth 0.025 with 1.5 flips — the sewn outline itself is 0.040 with 2.
    expect(pouchRough / pieces).toBeLessThan(0.07);
    expect(caseRough / scenes).toBeLessThan(0.04);
    expect(caseFlips / scenes).toBeLessThan(3);
  });

  it("eases between settles without a wobbly in-between frame", () => {
    const a = inputOf(RECIPES["9"]);
    const b = inputOf(RECIPES["11"]);
    const from = settleSoftCut(a);
    const to = settleSoftCut(b);
    for (const plan of [morph(seedShapes(b), to, () => seedShapes(b)), morph(from, to, () => seedShapes(b))]) {
      // It ends on the settled shape (the hook then draws the settled shape itself).
      const end = plan.at(1).rings.get("center/back/3")!;
      for (const p of end) expect(distanceToPolygon(to.rings.get("center/back/3")!, p[0], p[1])).toBeLessThan(0.5);
      for (const t of [0.25, 0.5, 0.75]) {
        const frame = plan.at(t);
        expect(frame.rings.size).toBe(to.rings.size);
        let rough = 0;
        for (const ring of new Set(frame.rings.values())) rough = Math.max(rough, wobble(ring).rough);
        expect(rough).toBeLessThan(0.15);
        expect(wobble(frame.case, (p) => p[1] > b.frame.baseline - 0.6).rough).toBeLessThan(0.06);
      }
    }
  });

  it("settles every Section, the phone layout, and a raw (unsmoothed) setting without blowing up", () => {
    for (const section of ["left", "center", "right"] as const) {
      for (const compact of [false, true]) {
        const input = inputOf(RECIPES.mix, "M", section, compact);
        const shapes = settleSoftCut(input);
        expect(shapes.rings.size).toBe(Object.values(RECIPES.mix).flat().length);
        for (const ring of shapes.rings.values()) for (const p of ring) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
      }
    }
    const raw = { ...inputOf(RECIPES["8A"]), settings: { ...SOFT_BODY_DEFAULTS, smoothing: 0, rigidity: 0, volumePct: 180 } };
    const snap = smoothSnapshot(settleFresh(raw), { baseline: raw.frame.baseline, passes: 0 });
    for (const b of snap.bodies) for (const p of b.ring) expect(p[1]).toBeLessThanOrEqual(raw.frame.baseline + 1e-6);
  });

  it("settles a full recipe well inside a frame budget", () => {
    const input = inputOf(RECIPES.mix, "XL");
    const t = performance.now();
    settleFresh(input);
    // ~15–45 ms in a browser; generous for a shared CI runner.
    expect(performance.now() - t).toBeLessThan(400);
  });
});
