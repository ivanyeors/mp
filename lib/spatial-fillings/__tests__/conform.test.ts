import { describe, expect, it } from "vitest";

import {
  bolsterShellPolygon,
  chaikin,
  conformPouchPath,
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

  it("rounds corners harder the more compressed the pouch", () => {
    expect(flatTopSpan(pouchOutline({ x: 0, y: 0, w: 60, h: 60 }))).toBeGreaterThan(20);
    // 4:1 compression → full capsule: top cap peaks at a point, no flat run
    expect(flatTopSpan(pouchOutline({ x: 0, y: 0, w: 20, h: 80 }))).toBeLessThan(2);
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
