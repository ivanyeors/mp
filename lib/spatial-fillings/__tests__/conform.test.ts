import { describe, expect, it } from "vitest";

import {
  bolsterShellPolygon,
  chaikin,
  clipToConvex,
  conformPouchPath,
  insetRing,
  labelRectOf,
  makeRegion,
  nearestOnBoundary,
  parsePathPolygon,
  pointInPolygon,
  pouchOutline,
  type Pt,
} from "../conform";

const SQUARE: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

const pathPoints = (d: string): Pt[] => {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
};

describe("parsePathPolygon", () => {
  it("samples a polygon path verbatim", () => {
    expect(parsePathPolygon("M0 0 L10 0 L10 10 L0 10 Z")).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it("samples cubic segments into intermediate points", () => {
    const pts = parsePathPolygon("M0 0 C10 0 20 0 30 0 L30 10 Z", 4);
    expect(pts.length).toBe(6); // M + 4 curve samples + L
    expect(pts[pts.length - 1]).toEqual([30, 10]);
  });
});

describe("pointInPolygon / nearestOnBoundary", () => {
  it("classifies inside vs outside", () => {
    expect(pointInPolygon([50, 50], SQUARE)).toBe(true);
    expect(pointInPolygon([150, 50], SQUARE)).toBe(false);
  });

  it("projects to the nearest boundary point", () => {
    const { q, dist } = nearestOnBoundary([50, 120], SQUARE, 1);
    expect(q).toEqual([50, 100]);
    expect(dist).toBe(20);
  });
});

describe("pouchOutline", () => {
  // width of the flat run at the very top — shrinks as corners round harder
  const flatTopSpan = (pts: Pt[]) => {
    const minY = Math.min(...pts.map(([, y]) => y));
    const xs = pts.filter(([, y]) => y < minY + 1e-6).map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };

  it("keeps a modest, constant corner radius — stuffing pressed into the compartment's corners", () => {
    // 18% of the short side each corner: a 60×60 pouch keeps a 60 − 2 × 10.8 flat top…
    expect(flatTopSpan(pouchOutline({ x: 0, y: 0, w: 60, h: 60 }))).toBeCloseTo(60 - 2 * 0.18 * 60, 1);
    // …and a 20×80 one (a squeezed tract) keeps 20 − 2 × 3.6, not a capsule point.
    expect(flatTopSpan(pouchOutline({ x: 0, y: 0, w: 20, h: 80 }))).toBeCloseTo(20 - 2 * 0.18 * 20, 1);
    // A pill is always the full capsule: its top cap peaks at a point.
    expect(flatTopSpan(pouchOutline({ x: 0, y: 0, w: 20, h: 80 }, 5, "pill"))).toBeLessThan(2);
  });

  it("stays inside its rect", () => {
    for (const [x, y] of pouchOutline({ x: 5, y: 7, w: 30, h: 90 })) {
      expect(x).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(x).toBeLessThanOrEqual(35 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(7 - 1e-9);
      expect(y).toBeLessThanOrEqual(97 + 1e-9);
    }
  });
});

describe("conformPouchPath", () => {
  const region = makeRegion(SQUARE, 4);
  const rect = { x: 60, y: 10, w: 80, h: 80 }; // bleeds past the right wall

  const maxTurnDeg = (pts: Pt[]) => {
    let worst = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      let d = Math.abs(
        Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]),
      );
      if (d > Math.PI) d = 2 * Math.PI - d;
      worst = Math.max(worst, (d * 180) / Math.PI);
    }
    return worst;
  };

  it("keeps every output point at least the seam inside the region", () => {
    const pts = pathPoints(conformPouchPath(rect, [region]));
    for (const p of pts) {
      expect(pointInPolygon(p, SQUARE)).toBe(true);
      expect(nearestOnBoundary(p, SQUARE, region.sign).dist).toBeGreaterThanOrEqual(4 - 0.6);
    }
  });

  it("is deterministic and closed", () => {
    const a = conformPouchPath(rect, [region]);
    expect(conformPouchPath(rect, [region])).toBe(a);
    expect(a).toMatch(/^M.*Z$/);
  });

  it("compressed pouches have no sharp bends", () => {
    const pts = pathPoints(conformPouchPath({ x: 10, y: 10, w: 18, h: 80 }, []));
    expect(maxTurnDeg(pts)).toBeLessThan(30);
  });

  it("rounds the corners where the pouch meets a wall, not only its own", () => {
    // Bleeds past the right wall: the two corners the wall makes are fillets too.
    const pts = pathPoints(conformPouchPath(rect, [region]));
    expect(maxTurnDeg(pts)).toBeLessThan(30);
    // …and where the shell has a (sampled, rounded) notch, the pouch wraps it
    // with no sharp corner anywhere and never leaves the shell.
    const notchArc: Pt[] = [0, 1, 2, 3, 4, 5, 6].map((k) => {
      const t = (Math.PI / 2) * (k / 6);
      return [70 - 10 * Math.cos(t), 30 + 10 * Math.sin(t)];
    });
    const notched = makeRegion([[0, 0], [60, 0], ...notchArc, [100, 40], [100, 100], [0, 100]], 2);
    const inNotch = pathPoints(conformPouchPath({ x: 1, y: 1, w: 98, h: 98 }, [notched]));
    expect(maxTurnDeg(inNotch)).toBeLessThan(30);
    for (const p of inNotch) expect(pointInPolygon(p, notched.poly)).toBe(true);
  });

  it("leaves a fully-inside pouch untouched except smoothing", () => {
    const pts = pathPoints(conformPouchPath({ x: 20, y: 20, w: 30, h: 30 }, [region]));
    for (const p of pts) {
      expect(p[0]).toBeGreaterThanOrEqual(19);
      expect(p[0]).toBeLessThanOrEqual(51);
    }
  });
});

describe("chaikin", () => {
  it("doubles the points and cuts corners inward", () => {
    const out = chaikin(SQUARE);
    expect(out.length).toBe(8);
    // the original sharp corner (0,0) is gone
    expect(out.some(([x, y]) => x === 0 && y === 0)).toBe(false);
  });
});

describe("bolsterShellPolygon", () => {
  it("is a closed convex-ish capsule with sampled end caps", () => {
    const poly = bolsterShellPolygon("medium");
    expect(poly.length).toBeGreaterThan(40);
    expect(pointInPolygon([332, 187], poly)).toBe(true); // view center
    expect(pointInPolygon([10, 187], poly)).toBe(false); // outside the caps
  });
});

describe("labelRectOf: a label sits on the drawn body", () => {
  it("centres on a full rectangle and spans it", () => {
    const r = labelRectOf("M10 10 L110 10 L110 60 L10 60 Z");
    expect(r).toEqual({ x: 10, y: 10, w: 100, h: 50 });
  });

  it("sits on the wide arm of a notched outline, inside the body", () => {
    // A 100×100 square with its top-right 60×60 cut away (an L): the label
    // lands on the full-width bottom arm, never across the notch.
    const r = labelRectOf("M0 0 L40 0 L40 60 L100 60 L100 100 L0 100 Z");
    expect(r).toEqual({ x: 0, y: 60, w: 100, h: 40 });
  });

  it("stays on the body beside a notch that the centroid's row runs into", () => {
    // A tall left lobe with a notch on the right of its upper half: the row
    // through the centroid is the narrow part, the rect keeps to it.
    const r = labelRectOf("M0 0 L60 0 L60 50 L100 50 L100 100 L0 100 Z");
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe("insetRing / clipToConvex", () => {
  it("moves a square's edges inward by the seam whichever way it winds", () => {
    const inward = insetRing(SQUARE, 4);
    const reversed = insetRing([...SQUARE].reverse(), 4);
    for (const ring of [inward, reversed]) {
      expect(ring).toHaveLength(4);
      for (const [x, y] of ring) {
        expect([4, 96]).toContainEqual(Math.round(x * 1e6) / 1e6);
        expect([4, 96]).toContainEqual(Math.round(y * 1e6) / 1e6);
      }
    }
  });

  it("keeps the part of a notched ring inside a rect", () => {
    const notched: Pt[] = [[0, 0], [60, 0], [60, 40], [100, 40], [100, 100], [0, 100]];
    const out = clipToConvex(notched, [[50, 20], [120, 20], [120, 80], [50, 80]]);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(50 - 1e-9);
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(y).toBeLessThanOrEqual(80 + 1e-9);
    }
    expect(out.some(([x, y]) => Math.abs(x - 60) < 1e-9 && Math.abs(y - 40) < 1e-9)).toBe(true); // the notch corner survives
  });
});

describe("openRing (opening by the pouch radius)", () => {
  it("turns a rectangle into a rounded rectangle and never leaves it", async () => {
    const { openRing } = await import("../opening");
    const out = openRing([[0, 0], [100, 0], [100, 60], [0, 60]], 10);
    expect(out.length).toBeGreaterThan(20);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(60);
    }
    // the corner cell (0.5, 0.5) is gone — rounded off at radius 10
    expect(out.some(([x, y]) => x < 2 && y < 2)).toBe(false);
  });

  it("drops a sliver thinner than the disc and keeps the body", async () => {
    const { openRing } = await import("../opening");
    // A 100×60 body with a 6-unit-tall tail sticking out to the right.
    const withTail: Pt[] = [[0, 0], [100, 0], [100, 27], [160, 27], [160, 33], [100, 33], [100, 60], [0, 60]];
    const out = openRing(withTail, 10);
    expect(Math.max(...out.map(([x]) => x))).toBeLessThan(102);
    expect(Math.max(...out.map(([x]) => x))).toBeGreaterThan(95);
  });
});
