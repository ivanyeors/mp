import { describe, expect, it } from "vitest";

import type { BolsterPlacement } from "../core";
import { BOLSTER_DIMENSIONS, GENERIC_POUCH, SEAM_MM, type PouchDimensions, type ResolvedDims } from "../dimensions";
import { bolsterFitMessage, fitBolster } from "../fit";
import { bolsterSettledThicknessMm, bolsterSpreadCapacityMm, FABRIC_GIVE, settleBolster } from "../settle";
import { bolsterFrame, bolsterStage, layoutBolsterPlacements } from "../xray-layout";

const pouch = (dims: Partial<PouchDimensions>): PouchDimensions => ({ ...GENERIC_POUCH, ...dims });
const resolved = (id: number, dims: Partial<PouchDimensions>): [number, ResolvedDims] => [
  id,
  { key: `k${id}`, kind: "pouch", source: "measured", measuredOn: "2026-10-01", dims: pouch(dims) },
];
const piece = (slot: number, itemId = 1): BolsterPlacement => ({ slot, itemId });
// 200 mm wide, 60 → 40 mm thick: its fabric gives (π/2 − 1) × 20 ≈ 11.4 mm pressed flat — the volume (100 mm) never binds.
// Item 2 is 400 → 150 mm thick: alone it spreads its give (142.7 mm) into the ends and still settles to 400 × 200/342.7 = 233 > the 200 mm diameter.
const GIVE = FABRIC_GIVE * 20;
const dims = new Map([resolved(1, { widthMm: 200, minWidthMm: 150, thicknessMm: 60, minThicknessMm: 40 }), resolved(2, { widthMm: 200, minWidthMm: 150, thicknessMm: 400, minThicknessMm: 150 })]);
const capsule = { lengthMm: 900, diameterMm: 200 };

describe("settleBolster", () => {
  it("spreads a lone pouch into both ends, and the end pouches of a pack into their end — as far as the fabric gives", () => {
    expect(bolsterSpreadCapacityMm(pouch({ widthMm: 200, thicknessMm: 60, minThicknessMm: 40 }))).toBeCloseTo(GIVE, 6);
    // A measured flat width is the fabric's limit instead.
    expect(bolsterSpreadCapacityMm(pouch({ widthMm: 200, thicknessMm: 60, minThicknessMm: 40, flatWidthMm: 240 }))).toBe(40);
    expect(bolsterSettledThicknessMm(pouch({ widthMm: 200, thicknessMm: 60, minThicknessMm: 40 }), 300)).toBeCloseTo(40, 6);
    const [alone] = settleBolster([{ slot: 1, itemId: 1, dims: dims.get(1)!.dims }], 900);
    expect(alone.spreadMm).toBeCloseTo(GIVE, 1); // what the fabric gives, not the 700 mm of slack
    expect(alone.settledWidthMm).toBeCloseTo(200 + GIVE, 1);
    expect(alone.settledThicknessMm).toBeCloseTo((60 * 200) / (200 + GIVE), 1);
    const three = settleBolster([1, 2, 3].map((slot) => ({ slot, itemId: 1, dims: dims.get(1)!.dims })), 900);
    // 3 × 200 + 2 seams = 604; 296 of slack, 148 an end: each end pouch spreads its give.
    expect(three.map((s) => s.spreadMm)).toEqual([11.4, 0, 11.4]);
    expect(three[1].settledThicknessMm).toBe(60);
    // A capsule with less slack than the give: the end is the limit (98 mm of slack, 49 an end, against item 2's 142.7).
    const tight = settleBolster([1, 2].map((slot) => ({ slot, itemId: 2, dims: dims.get(2)!.dims })), 500);
    expect(tight.map((s) => s.spreadMm)).toEqual([49, 49]);
  });
});

describe("fitBolster", () => {
  it("is ok, compressed or over along the capsule, and deterministic across input order", () => {
    const ok = fitBolster([piece(1), piece(2)], "medium", { dims, bolster: capsule });
    expect(ok.lengthStatus).toBe("ok");
    expect(ok.status).toBe("ok");
    expect(ok.usedMm).toBeCloseTo(2 * (200 + GIVE) + SEAM_MM, 1); // both settled into the ends by their give, no squeeze
    expect(ok.pieces.map((p) => p.widthRatio)).toEqual([1, 1]);
    // 5 × 200 + 4 seams = 1008 > 900; 5 × 150 + 8 = 758 ≤ 900 → compressed, Σ drawn = 900.
    const five = [1, 2, 3, 4, 5].map((slot) => piece(slot));
    const compressed = fitBolster(five, "medium", { dims, bolster: capsule });
    expect(compressed.status).toBe("compressed");
    expect(compressed.usedMm).toBeCloseTo(900, 1);
    expect(compressed.pieces.every((p) => p.widthRatio < 1)).toBe(true);
    // 7 × 150 + 12 = 1062 > 900 even fully squeezed.
    const seven = [1, 2, 3, 4, 5, 6, 7].map((slot) => piece(slot));
    const over = fitBolster(seven, "medium", { dims, bolster: capsule });
    expect(over.status).toBe("over");
    expect(over.usedMm).toBeCloseTo(over.minMm, 1);
    expect(JSON.stringify(fitBolster([...five].reverse(), "medium", { dims, bolster: capsule }))).toBe(JSON.stringify(compressed));
    expect(fitBolster([], "short").status).toBe("ok");
  });

  it("flags a pouch thicker than the diameter, compressed when it can squeeze to fit and over when it cannot", () => {
    // Two pouches in a 500 mm capsule: 98 mm of slack, 49 an end, so item 2
    // settles to 400 × 200/249 = 321 mm — over the 200 mm diameter, but its
    // 150 mm floor is under it.
    const thick = fitBolster([piece(1, 1), piece(2, 2)], "medium", { dims, bolster: { lengthMm: 500, diameterMm: 200 } });
    expect(thick.lengthStatus).toBe("ok");
    expect(thick.pieces[1].thicknessStatus).toBe("compressed");
    expect(thick.pieces[0].thicknessStatus).toBe("ok");
    expect(thick.status).toBe("compressed");
    // Alone in a long capsule the same pouch spreads only what its fabric gives: still thicker than the diameter, so it squeezes.
    expect(fitBolster([piece(1, 2)], "medium", { dims, bolster: capsule }).status).toBe("compressed");
    const rigid = new Map([resolved(3, { widthMm: 200, thicknessMm: 260, minThicknessMm: 220 })]);
    const over = fitBolster([piece(1, 3)], "medium", { dims: rigid, bolster: capsule });
    expect(over.pieces[0].thicknessStatus).toBe("over");
    expect(over.status).toBe("over");
    // 260 × 200 / (200 + its 22.8 mm of give) = 233 mm settled; 220 fully compressed is still over 200.
    expect(bolsterFitMessage(over, () => "6D (L)")).toBe("6D (L) is 233 mm thick, 220 mm fully compressed; the Mbolster is 200 mm across");
  });

  it("messages the length first, then the thickness, else fits", () => {
    const five = [1, 2, 3, 4, 5].map((slot) => piece(slot));
    expect(bolsterFitMessage(fitBolster(five, "medium", { dims, bolster: capsule }))).toBe("5 pouches need 1008 mm relaxed, 758 mm fully squeezed; the medium Mbolster is 900 mm long");
    expect(bolsterFitMessage(fitBolster([piece(1)], "medium", { dims, bolster: capsule }))).toBe("fits");
  });

  it("reads the registry capsule per length", () => {
    for (const length of ["short", "medium", "long"] as const) {
      const fit = fitBolster([piece(1)], length, { dims });
      expect(fit.lengthMm).toBe(BOLSTER_DIMENSIONS[length].lengthMm);
      expect(fit.diameterMm).toBe(BOLSTER_DIMENSIONS[length].diameterMm);
    }
  });
});

describe("bolster layout fills the capsule (the fit stays true-scale)", () => {
  it("draws a lone pouch wall to wall and the capsules differ by their registry lengths", () => {
    const [p] = layoutBolsterPlacements([piece(1)], "medium", { dims: new Map([resolved(1, { widthMm: 200, lengthMm: 120 })]) });
    const stage = bolsterStage("medium");
    const frame = bolsterFrame("medium");
    expect(p.w).toBeCloseTo(frame.w, 1);
    expect(p.h).toBeCloseTo(frame.h, 1);
    expect(stage.k).toBeCloseTo(560 / BOLSTER_DIMENSIONS.medium.lengthMm, 6);
    expect(bolsterStage("short").heightView).toBeCloseTo(BOLSTER_DIMENSIONS.short.diameterMm * bolsterStage("short").k, 1);
    expect(bolsterStage("long").k).toBeLessThan(bolsterStage("short").k);
  });

  it("shares the capsule by the settled, squeezed widths the fit says, and three pouches span it end to end", () => {
    const three = [1, 2, 3].map((slot) => piece(slot));
    const fit = fitBolster(three, "long", { dims });
    const laid = layoutBolsterPlacements(three, "long", { dims, fit });
    const drawnMm = (i: number) => fit.pieces[i].settledWidthMm * fit.pieces[i].widthRatio;
    expect(laid[0].w / laid[1].w).toBeCloseTo(drawnMm(0) / drawnMm(1), 2);
    expect(laid[0].w).toBeGreaterThan(laid[1].w); // the end pouch spread, the middle one did not
    const frame = bolsterFrame("long");
    expect(laid[2].x + laid[2].w - laid[0].x).toBeCloseTo(frame.w, 0);
    const relaxed = layoutBolsterPlacements(three, "long", { dims });
    expect(relaxed[0].w).toBeCloseTo(relaxed[1].w, 1); // equal widths, equal shares
  });
});
