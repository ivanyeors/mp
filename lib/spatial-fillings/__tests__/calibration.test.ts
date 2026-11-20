import { describe, expect, it } from "vitest";

import { calibrationSheet } from "../calibration";
import { CODE_REGISTRY, PILLOW_SIZES, type DimensionRegistry } from "../dimensions";
import { effectiveRegistry } from "../dimension-overrides";
import { fitPillow } from "../fit";

const measured: DimensionRegistry = effectiveRegistry(
  [
    { key: "6d/l", width_mm: 200, length_mm: 100, thickness_mm: 60, min_thickness_mm: 35, min_width_mm: 170, orientation: "across" },
    { key: "3d/s", width_mm: 120, length_mm: 80, thickness_mm: 30, min_thickness_mm: 18, min_width_mm: 100, orientation: "across" },
  ],
  [],
  null,
);

describe("calibrationSheet", () => {
  const sheet = calibrationSheet(measured);

  it("lists every catalogue pouch and Neck support, and names the ones still on a fallback", () => {
    expect(sheet.footprints.length).toBeGreaterThanOrEqual(12);
    expect(sheet.neck.map((n) => n.label)).toEqual(["Neck support XS", "Neck support S", "Neck support M", "Neck support L"]);
    expect(sheet.unmeasured).not.toContain("6D (L)");
    expect(sheet.unmeasured).toContain("6D (S)");
    expect(calibrationSheet(CODE_REGISTRY).unmeasured.length).toBe(sheet.footprints.length + sheet.neck.length);
  });

  it("states footprints at every Size, M as entered and the others scaled from it", () => {
    const l = sheet.footprints.find((f) => f.key === "6d/l")!;
    expect(l.source).toBe("configured");
    expect(l.bySize.M).toEqual({ widthMm: 200, lengthMm: 100, thicknessMm: 60 });
    expect(l.bySize.XS.widthMm).toBeLessThan(200);
    expect(l.bySize.XL.widthMm).toBeGreaterThan(200);
    expect(Object.keys(l.bySize)).toEqual([...PILLOW_SIZES]);
  });

  it("finds the Layer count that squeezes before the one that cannot close", () => {
    for (const row of sheet.layers) {
      for (const size of PILLOW_SIZES) {
        for (const kind of ["side", "centre"] as const) {
          const { compressedAt, overAt } = row.bySize[size][kind];
          if (overAt !== null) expect(compressedAt).not.toBeNull();
          if (overAt !== null && compressedAt !== null) expect(compressedAt).toBeLessThanOrEqual(overAt);
        }
      }
    }
    const l = sheet.layers.find((r) => r.key === "6d/l")!.bySize.M;
    expect(l.centre.overAt ?? 99).toBeLessThanOrEqual(l.side.overAt ?? 99);
  });

  it("predicts the settle and the seam from the same settle the x-ray draws: true size, no spread", () => {
    const l = sheet.settle.find((s) => s.key === "6d/l")!;
    expect([l.spreadFrontMm, l.spreadBackMm]).toEqual([0, 0]);
    expect(l.lengthMm).toBe(100);
    expect(l.settledLengthMm).toBe(l.lengthMm);
    expect(l.settledThicknessMm).toBe(l.thicknessMm);
    expect(sheet.seam?.key).toBe("6d/l");
    expect(sheet.seam!.seamFromFrontMm).toBe(105);
  });

  it("states the budgets with the Settings allowance, and the five-6D-L checks with their messages", () => {
    const m = sheet.budgets.find((b) => b.size === "M")!;
    expect(m.centreMm).toBeLessThan(m.sideMm);
    expect(sheet.squeeze).toHaveLength(2);
    for (const s of sheet.squeeze) expect(s.message.length).toBeGreaterThan(0);
    expect(calibrationSheet({ ...measured, loftAllowance: 0.2 }).budgets[0].sideMm).toBeGreaterThan(sheet.budgets[0].sideMm);
  });

  it("reads a default template's middle loft exactly as the fit does", () => {
    const placements = [
      { section: "left" as const, subSection: "middle" as const, slot: 1, itemId: 7 },
      { section: "center" as const, subSection: "middle" as const, slot: 1, itemId: 7 },
    ];
    const dims = new Map([[7, { key: "6d/l", kind: "pouch" as const, source: "configured" as const, measuredOn: null, dims: measured.pouches["6d/l"] }]]);
    const [row] = calibrationSheet(measured, [{ size: "M", tier: "premium", name: "M default", placements, dims }]).templates;
    const fit = fitPillow(placements, { size: "M", dims, loftAllowance: measured.loftAllowance });
    expect(row.middleLoftMm.left).toBe(Math.round(fit.sections.left.loftBySubSection.middle));
    expect(row.middleLoftMm.right).toBe(0);
    expect(row.status).toBe(fit.status);
  });
});
