import { describe, expect, it } from "vitest";

import { puffOf, puffyGloss, puffyPath, rollPath } from "./slab-shape";

/** Every coordinate pair in a path, for bounds checks. */
const points = (d: string) => {
  const ns = [...d.replace(/[A-Za-z]/g, " ").matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ns.length; i += 2) out.push([ns[i], ns[i + 1]]);
  return out;
};

describe("puffyPath", () => {
  const box = { x: 10, y: 20, w: 200, h: 40 };

  it("is one closed curve of cubics — no rects, no straight runs", () => {
    const d = puffyPath(box);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(8);
    expect(d).not.toMatch(/[LHV]/);
  });

  it("starts at the crown, which reaches the top of its box, and the belly its bottom", () => {
    const d = puffyPath(box);
    expect(d.startsWith("M110 20 ")).toBe(true);
    expect(d).toContain(" 110 60 C");
  });

  it("stays inside its box at the anchors, so stacked pouches still sum to the loft", () => {
    const d = puffyPath(box, 1);
    const anchors = d.split(/(?=[CZ])/).flatMap((seg) => {
      const p = points(seg);
      return p.length ? [p[p.length - 1]] : [];
    });
    for (const [x, y] of anchors) {
      expect(x).toBeGreaterThanOrEqual(box.x - 0.05);
      expect(x).toBeLessThanOrEqual(box.x + box.w + 0.05);
      expect(y).toBeGreaterThanOrEqual(box.y - 0.05);
      expect(y).toBeLessThanOrEqual(box.y + box.h + 0.05);
    }
  });

  it("crowns less when the pouch is spread or squeezed", () => {
    // The shoulder (the end of the first curve) sits lower under the top the fuller the pouch.
    const shoulderY = (puff: number) => points(puffyPath(box, puff).split("C")[1])[2][1];
    expect(shoulderY(1)).toBeGreaterThan(shoulderY(0.3));
    expect(shoulderY(0.3)).toBeGreaterThan(box.y);
  });

  it("a short pouch is all rounded ends, without a crown", () => {
    const d = puffyPath({ x: 0, y: 0, w: 20, h: 30 });
    expect(d.startsWith("M10 0 ")).toBe(true);
    expect(d).not.toContain("NaN");
  });
});

describe("the rest of the shape kit", () => {
  it("draws a sheen only where it fits", () => {
    expect(puffyGloss({ x: 0, y: 0, w: 120, h: 30 })).toMatch(/^M/);
    expect(puffyGloss({ x: 0, y: 0, w: 120, h: 6 })).toBe("");
  });

  it("a roll is a circle on the bottom of its box", () => {
    expect(rollPath({ x: 0, y: 0, w: 100, h: 40 })).toBe("M30 20 A20 20 0 1 0 70 20 A20 20 0 1 0 30 20 Z");
  });

  it("puff is drawn ÷ relaxed, clamped", () => {
    expect(puffOf(15, 30)).toBe(0.5);
    expect(puffOf(40, 30)).toBe(1);
    expect(puffOf(10, 0)).toBe(1);
  });
});
