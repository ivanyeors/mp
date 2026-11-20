import { describe, expect, it } from "vitest";

import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  decideTextTone,
  relativeLuminance,
  legiblePixels,
  requiredRatio,
} from "@/lib/a11y/text-contrast";

function solid(rgb: [number, number, number], count = 16): Uint8ClampedArray {
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) out.set([...rgb, 255], i * 4);
  return out;
}

function concat(...parts: Uint8ClampedArray[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("relativeLuminance / contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
    const grey = relativeLuminance(0x76, 0x76, 0x76);
    expect(contrastRatio(1, grey)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(grey, 1)).toBeCloseTo(contrastRatio(1, grey), 10);
  });
});

describe("requiredRatio", () => {
  it("treats 24px, or 18.66px bold, as large text", () => {
    expect(requiredRatio(16, 500)).toBe(AA_NORMAL_TEXT);
    expect(requiredRatio(30, 600)).toBe(AA_LARGE_TEXT);
    expect(requiredRatio(20, 700)).toBe(AA_LARGE_TEXT);
    expect(requiredRatio(20, 600)).toBe(AA_NORMAL_TEXT);
  });
});

describe("legiblePixels", () => {
  it("counts the pixels each tone meets the ratio over", () => {
    const pixels = concat(solid([20, 20, 20], 30), solid([230, 230, 230], 70));
    const region = { pixels, minRatio: AA_NORMAL_TEXT };
    expect(legiblePixels(region, "light")).toBe(30);
    expect(legiblePixels(region, "dark")).toBe(70);
  });
});

describe("decideTextTone", () => {
  it("puts white text on a dark photo", () => {
    const region = { pixels: solid([20, 30, 25]), minRatio: AA_NORMAL_TEXT };
    expect(decideTextTone([region])).toEqual({ tone: "light", passes: true });
  });

  it("puts dark text on a light photo", () => {
    const region = { pixels: solid([235, 230, 220]), minRatio: AA_NORMAL_TEXT };
    expect(decideTextTone([region])).toEqual({ tone: "dark", passes: true });
  });

  it("weighs the copy by area, and fails AA when any block misses", () => {
    const title = { pixels: solid([90, 90, 90]), minRatio: AA_LARGE_TEXT };
    const body = { pixels: solid([240, 240, 240], 4), minRatio: AA_NORMAL_TEXT };
    expect(legiblePixels(title, "light")).toBe(16);
    expect(legiblePixels(body, "light")).toBe(0);
    expect(decideTextTone([title, body])).toEqual({ tone: "light", passes: false });
  });

  it("ignores a highlight smaller than the coverage allowance", () => {
    const pixels = concat(solid([15, 15, 15], 99), solid([255, 255, 255], 1));
    expect(decideTextTone([{ pixels, minRatio: AA_NORMAL_TEXT }])).toEqual({ tone: "light", passes: true });
    expect(decideTextTone([{ pixels, minRatio: AA_NORMAL_TEXT }], 1)).toEqual({ tone: "light", passes: false });
  });

  it("picks the tone legible over more of a busy photo and reports the miss", () => {
    const pixels = concat(solid([40, 40, 40], 40), solid([200, 200, 200], 60));
    expect(decideTextTone([{ pixels, minRatio: AA_NORMAL_TEXT }])).toEqual({ tone: "dark", passes: false });
  });

  it("passes an empty region", () => {
    expect(decideTextTone([{ pixels: new Uint8ClampedArray(), minRatio: AA_NORMAL_TEXT }])).toEqual({
      tone: "light",
      passes: true,
    });
  });
});
