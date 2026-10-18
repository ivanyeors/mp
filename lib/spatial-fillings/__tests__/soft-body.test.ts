import { describe, expect, it } from "vitest";

import { createSettle, labelSpot, pointInPolygon, resample, ringLength, signedArea, smoothSnapshot, taubin, type Pt } from "../soft-body";

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const circle = (cx: number, cy: number, r: number, n: number): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * 2 * Math.PI), cy + r * Math.sin((k / n) * 2 * Math.PI)]);

describe("resample", () => {
  it("spaces points evenly along a closed outline", () => {
    const P = resample(rect(0, 0, 100, 50), 60);
    expect(P).toHaveLength(60);
    const steps = P.map((p, i) => Math.hypot(P[(i + 1) % 60][0] - p[0], P[(i + 1) % 60][1] - p[1]));
    for (const s of steps) expect(s).toBeCloseTo(5, 5);
    expect(ringLength(P)).toBeCloseTo(300, 5);
  });
});

describe("taubin", () => {
  it("smooths ripples without shrinking the outline, and leaves fixed points alone", () => {
    const rippled = circle(0, 0, 50, 120).map(([x, y], k): Pt => {
      const r = 1 + 0.03 * Math.cos(k * 1.7);
      return [x * r, y * r];
    });
    const smooth = taubin(rippled, 8);
    expect(Math.abs(signedArea(smooth)) / Math.abs(signedArea(rippled))).toBeGreaterThan(0.98);
    const radii = smooth.map(([x, y]) => Math.hypot(x, y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1.5);
    const fixed = rippled.map((_, k) => k < 10);
    const held = taubin(rippled, 8, fixed);
    for (let k = 0; k < 10; k++) expect(held[k]).toEqual(rippled[k]);
  });
});

describe("createSettle", () => {
  // A box of a case, flat bottom on y = 100, with one pouch dropped in it.
  const outline = resample(rect(0, 20, 200, 80), 80);
  const frame = { outline, baseline: 100, width: 220, height: 140 };
  const pouch = { id: "p", ring: resample(rect(40, 60, 120, 30), 40), kind: "pouch" as const };

  it("is deterministic, and the result never depends on how the steps are split", () => {
    const run = (split: number) => {
      const sim = createSettle([pouch], frame);
      while (!sim.step(split));
      return sim.snapshot();
    };
    const once = run(100);
    expect(run(100)).toEqual(once);
    expect(run(1)).toEqual(once);
    expect(run(5)).toEqual(once);
  });

  it("rests the pouch on the floor, keeps its volume, and pins the case's flat bottom", () => {
    const sim = createSettle([{ ...pouch, areaTarget: 3600 * 1.2 }], frame);
    sim.step(sim.steps);
    const snap = sim.snapshot();
    const ring = snap.bodies[0].ring;
    expect(100 - Math.max(...ring.map((p) => p[1]))).toBeLessThan(6);
    expect(Math.abs(signedArea(ring)) / (3600 * 1.2)).toBeGreaterThan(0.85);
    for (const [, y] of snap.case) expect(y).toBeLessThanOrEqual(100);
    expect(snap.case.filter(([, y]) => y === 100).length).toBeGreaterThan(10);
  });

  it("keeps a firm roll nearly round, giving a little under load — less the firmer it is", () => {
    // A Neck support with a pouch lying on it.
    const roll = { id: "r", ring: circle(100, 74, 25, 36), kind: "roll" as const };
    const load = { id: "p", ring: resample(rect(30, 20, 140, 28), 40), kind: "pouch" as const, areaTarget: 140 * 28 * 1.2 };
    const squash = (rollFirmness: number) => {
      const sim = createSettle([roll, load], frame, { rollFirmness });
      sim.step(sim.steps);
      const ring = sim.snapshot().bodies[0].ring;
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      return { aspect: (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)), area: Math.abs(signedArea(ring)) / Math.abs(signedArea(roll.ring)) };
    };
    const firm = squash(0.75);
    const soft = squash(0.25);
    expect(firm.aspect).toBeGreaterThan(1.005);
    expect(firm.aspect).toBeLessThan(1.35);
    expect(firm.area).toBeGreaterThan(0.9);
    expect(soft.aspect).toBeGreaterThan(firm.aspect);
  });
});

describe("smoothSnapshot", () => {
  it("keeps the case's flat bottom on the baseline", () => {
    const snap = { case: resample(rect(0, 20, 200, 80), 80), bodies: [{ id: "p", ring: circle(100, 70, 20, 40) }] };
    const out = smoothSnapshot(snap, { baseline: 100 });
    const bottom = out.case.filter(([, y]) => y > 99.4);
    expect(bottom.length).toBeGreaterThan(10);
    for (const [, y] of bottom) expect(y).toBe(100);
  });
});

describe("labelSpot", () => {
  it("finds the roomiest point inside an outline", () => {
    const P = resample(rect(0, 0, 100, 40), 80);
    const { at, r } = labelSpot(P);
    expect(pointInPolygon(P, at[0], at[1])).toBe(true);
    expect(r).toBeGreaterThan(15);
  });
});
