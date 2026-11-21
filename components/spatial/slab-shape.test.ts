import { describe, expect, it } from "vitest";

import { pouchPath, puffOf, puffyPath, rollPath, shellPolygon, smoothClosedPath } from "./slab-shape";

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

describe("squish: a pressed face flattens, a free one domes", () => {
  const box = { x: 10, y: 20, w: 200, h: 40 };
  const shoulderY = (d: string) => points(d.split("C")[1])[2][1];
  const endX = (d: string) => points(d.split("C")[1])[2][0];

  it("domes a free top and all but flattens one something lies on", () => {
    const free = shoulderY(puffyPath(box, 1));
    const pressed = shoulderY(puffyPath(box, 1, { top: true, front: false, back: false }));
    expect(free - box.y).toBeGreaterThan(5);
    expect(pressed - box.y).toBeLessThan(2);
  });

  it("rounds a free end and blunts one pressed against a neighbour or the case", () => {
    const free = endX(puffyPath(box, 1));
    const blunt = endX(puffyPath(box, 1, { top: false, front: false, back: true }));
    expect(blunt).toBeGreaterThan(free);
    expect(box.x + box.w - blunt).toBeLessThan(0.35 * box.h);
  });
});

describe("pouchPath: in the pillow", () => {
  const box = { x: 10, y: 20, w: 200, h: 40 };
  const shell = shellPolygon("M30 0 L200 0 L200 100 L0 100 Z", { tx: 0, ty: 0, sx: 1, sy: 1 });

  it("is the plain cushion, exact cubics, when nothing bends or presses it", () => {
    expect(pouchPath(box, 1)).toBe(puffyPath(box, 1));
    expect(pouchPath(box, 1, { sag: [0, 0, 0] })).toBe(puffyPath(box, 1));
    const roomy = shellPolygon("M-100 -100 L400 -100 L400 400 L-100 400 Z", { tx: 0, ty: 0, sx: 1, sy: 1 });
    expect(pouchPath(box, 1, { shell: { polygon: roomy, margin: 3 } })).toBe(puffyPath(box, 1));
  });

  it("sags where nothing holds it up: the middle drops, the ends stay", () => {
    const d = pouchPath(box, 1, { sag: [0, 6, 12, 6, 0] });
    const ys = points(d).filter(([x]) => Math.abs(x - 110) < 6).map(([, y]) => y);
    expect(Math.max(...ys)).toBeGreaterThan(box.y + box.h + 8);
    const ends = points(d).filter(([x]) => x < 14).map(([, y]) => y);
    expect(Math.max(...ends)).toBeLessThan(box.y + box.h + 1);
  });

  it("is pressed into the case: every point stays a margin inside the slanted wall", () => {
    const d = pouchPath({ x: 0, y: 50, w: 120, h: 40 }, 1, { shell: { polygon: shell, margin: 3 } });
    expect(d).not.toBe(puffyPath({ x: 0, y: 50, w: 120, h: 40 }, 1));
    const anchors = d.split(/(?=[CZ])/).flatMap((seg) => {
      const p = points(seg);
      return p.length ? [p[p.length - 1]] : [];
    });
    for (const [x, y] of anchors) expect(x - (30 - 0.3 * y)).toBeGreaterThan(3 * Math.cos(Math.atan(0.3)) - 0.3);
  });

  it("reads a designer's profile as a polygon in view units", () => {
    const poly = shellPolygon("M0 0 H10 V5 C10 8 0 8 0 5 Z", { tx: 100, ty: 50, sx: 2, sy: -2 }, 4);
    expect(poly[0]).toEqual([100, 50]);
    expect(poly[1]).toEqual([120, 50]);
    expect(poly[2]).toEqual([120, 40]);
    expect(poly).toHaveLength(3 + 4);
    expect(poly[poly.length - 1]).toEqual([100, 40]);
  });

  it("smooths a closed outline through every point", () => {
    const d = smoothClosedPath([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(d.startsWith("M0 0 ")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d).toContain(" 10 0 C");
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("the rest of the shape kit", () => {
  it("a roll is a circle on the bottom of its box", () => {
    expect(rollPath({ x: 0, y: 0, w: 100, h: 40 })).toBe("M30 20 A20 20 0 1 0 70 20 A20 20 0 1 0 30 20 Z");
  });

  it("puff is drawn ÷ relaxed, clamped", () => {
    expect(puffOf(15, 30)).toBe(0.5);
    expect(puffOf(40, 30)).toBe(1);
    expect(puffOf(10, 0)).toBe(1);
  });
});
