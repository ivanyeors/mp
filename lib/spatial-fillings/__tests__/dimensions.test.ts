import { describe, expect, it } from "vitest";

import {
  CODE_REGISTRY,
  dimsAtSize,
  GENERIC_POUCH,
  LOFT_ALLOWANCE,
  NECK_SUPPORT_FALLBACK,
  PILLOW_DIMENSIONS,
  PILLOW_SIZES,
  PLACEHOLDER_DIMENSIONS,
  POUCH_FAMILY_FALLBACKS,
  formatDims,
  maxLoftMm,
  pillowDimensions,
  pouchAtSize,
  pouchKey,
  resolveDims,
  sizeFactors,
  type DimensionRegistry,
} from "../dimensions";
import {
  SILHOUETTE_MASTER,
  SILHOUETTE_MASTER_LENGTH_MM,
  SILHOUETTE_MASTER_WIDTH_MM,
} from "../silhouette-master";

// Section widths at the protector's divider seams (reference/protector-sections.json, 22-9-2026).
const PROTECTOR_SECTIONS: Record<string, [number, number, number]> = {
  XS: [204.5, 195.0, 204.4],
  S: [203.4, 240.0, 203.5],
  M: [222.9, 260.0, 223.0],
  L: [251.0, 260.0, 251.0],
  XL: [278.7, 278.7, 278.6],
};

describe("PILLOW_DIMENSIONS", () => {
  it("carries every Size with Section widths that sum to the width (±1 mm) and match the protector seams", () => {
    for (const size of PILLOW_SIZES) {
      const d = PILLOW_DIMENSIONS[size];
      const sum = d.sectionWidthsMm[0] + d.sectionWidthsMm[1] + d.sectionWidthsMm[2];
      expect(Math.abs(sum - d.widthMm)).toBeLessThanOrEqual(1);
      d.sectionWidthsMm.forEach((w, i) => {
        expect(Math.abs(w - PROTECTOR_SECTIONS[size][i])).toBeLessThanOrEqual(1);
      });
    }
  });

  it("budgets loft per Section: sides equal, centre one inch lower, both with the allowance", () => {
    for (const size of PILLOW_SIZES) {
      const d = PILLOW_DIMENSIONS[size];
      expect(d.maxLoftMm[0]).toBe(d.maxLoftMm[2]);
      expect(d.maxLoftMm[0] - d.maxLoftMm[1]).toBeCloseTo(25 * (1 + LOFT_ALLOWANCE), 0);
      expect(d.maxLoftMm[0]).toBeCloseTo(d.gusset.fullMm * (1 + LOFT_ALLOWANCE), 1);
    }
    expect(maxLoftMm({ fullMm: 100, tabEndMm: 20, taperRunMm: 150, backMm: 75, dipRunMm: 100 }, 0.2)).toEqual([
      120, 90, 120,
    ]);
  });

  it("scales the master outline to widthMm × lengthMm with no vertex beyond the body length (no tab)", () => {
    for (const size of PILLOW_SIZES) {
      const d = PILLOW_DIMENSIONS[size];
      const xs = d.outline.map((p) => p[0]);
      const ys = d.outline.map((p) => p[1]);
      expect(Math.min(...xs)).toBeCloseTo(0, 0);
      expect(Math.max(...xs)).toBeCloseTo(d.widthMm, 0);
      expect(Math.min(...ys)).toBeCloseTo(0, 0);
      expect(Math.max(...ys)).toBeCloseTo(d.lengthMm, 0);
      expect(d.outline.length).toBe(SILHOUETTE_MASTER.length);
      expect(d.subSectionDividers).toBe(false);
    }
  });

  it("uses the master unscaled for M", () => {
    const m = PILLOW_DIMENSIONS.M;
    expect(Math.abs(m.widthMm - SILHOUETTE_MASTER_WIDTH_MM)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.lengthMm - SILHOUETTE_MASTER_LENGTH_MM)).toBeLessThanOrEqual(0.5);
    m.outline.forEach((p, i) => {
      expect(Math.abs(p[0] - SILHOUETTE_MASTER[i][0])).toBeLessThanOrEqual(0.15);
      expect(Math.abs(p[1] - SILHOUETTE_MASTER[i][1])).toBeLessThanOrEqual(0.15);
    });
  });

  it("falls back to M for a Size a host cannot know, and says so", () => {
    expect(pillowDimensions("xl")).toEqual({ dims: PILLOW_DIMENSIONS.XL, assumed: false });
    expect(pillowDimensions(null)).toEqual({ dims: PILLOW_DIMENSIONS.M, assumed: true });
    expect(pillowDimensions("XXL").assumed).toBe(true);
  });
});

describe("pouchKey", () => {
  it("keys the same pouch the same way whichever field carries the density or the size", () => {
    expect(pouchKey({ name: "filling", subtype: "6D (L)" })).toBe("6d/l");
    expect(pouchKey({ name: "6D L", subtype: null })).toBe("6d/l");
    expect(pouchKey({ name: "6D Fold", subtype: null, size: "L" })).toBe("6d/folded/l");
    expect(pouchKey({ name: "filling", subtype: "6D+ (Folded)" })).toBe("6d+/folded");
    expect(pouchKey({ name: "filling", subtype: "6D (Round)" })).toBe("6d/round");
    expect(pouchKey({ name: "filling", subtype: "3D (S)" })).toBe("3d/s");
    expect(pouchKey({ name: "Cervical Neck Support", category: "accessories", size: "M" })).toBe("neck/m");
    expect(pouchKey({ name: "Latex", subtype: null })).toBe("other/latex");
  });
});

describe("resolveDims", () => {
  it("resolves every seed descriptor to its family and never throws", () => {
    for (const subtype of ["3D (S)", "6D (S)", "6D (M)", "6D (L)", "6D (XL)", "6D (Round)", "6D+ (S)", "6D+ (L)", "6D+ (Folded)"]) {
      const r = resolveDims({ name: "filling", subtype });
      expect(r.kind).toBe("pouch");
      expect(r.dims.widthMm).toBeGreaterThan(0);
      expect(["measured", "fallback", "configured"]).toContain(r.source);
    }
    expect(resolveDims({ name: "6D (L)", subtype: null }).key).toBe(resolveDims({ name: "6D L", subtype: null }).key);
  });

  it("uses the family fallback for an unmeasured pouch and the generic pouch for an unknown type", () => {
    const sixD = resolveDims({ name: "filling", subtype: "6D (L)" });
    expect(sixD.source).toBe("fallback");
    expect(sixD.dims.widthMm).toBe(POUCH_FAMILY_FALLBACKS["6d"].widthMm);
    const latex = resolveDims({ name: "Latex", subtype: null });
    expect(latex.source).toBe("fallback");
    expect(latex.dims).toMatchObject({ widthMm: GENERIC_POUCH.widthMm, lengthMm: GENERIC_POUCH.lengthMm });
  });

  it("resolves a Neck support to its size or the fallback", () => {
    const neck = resolveDims({ name: "Cervical Neck Support", category: "accessories", size: "S" });
    expect(neck.kind).toBe("neck");
    expect(neck.dims.widthMm).toBe(NECK_SUPPORT_FALLBACK.widthMm);
    expect(neck.source).toBe("fallback");
    const measured: DimensionRegistry = {
      ...CODE_REGISTRY,
      neck: { S: { widthMm: 280, lengthMm: 80, thicknessMm: 45, minThicknessMm: 25, measuredOn: "2026-09-30" } },
    };
    const r = resolveDims({ name: "Cervical Neck Support", category: "accessories", size: "S" }, measured);
    expect(r).toMatchObject({ source: "measured", measuredOn: "2026-09-30", dims: { widthMm: 280, minWidthMm: 280 } });
  });

  it("reads a registry with rows applied: exact key, then the key without its size, then the family", () => {
    const registry: DimensionRegistry = {
      loftAllowance: 0.1,
      neck: {},
      configured: new Set(["6d/folded"]),
      pouches: {
        "6d/l": { widthMm: 210, lengthMm: 150, thicknessMm: 50, minThicknessMm: 28, minWidthMm: 180, orientation: "across", measuredOn: "2026-10-01" },
        "6d/folded": { widthMm: 150, lengthMm: 120, thicknessMm: 70, minThicknessMm: 40, minWidthMm: 130, orientation: "along", measuredOn: null },
      },
    };
    expect(resolveDims({ name: "filling", subtype: "6D (L)" }, registry)).toMatchObject({ source: "measured", dims: { widthMm: 210 } });
    expect(resolveDims({ name: "6D Fold", size: "M" }, registry)).toMatchObject({ key: "6d/folded/m", source: "configured", dims: { orientation: "along" } });
    expect(resolveDims({ name: "filling", subtype: "6D (Round)" }, registry).source).toBe("fallback");
  });

  it("ships with no placeholder posing as a measurement", () => {
    expect(PLACEHOLDER_DIMENSIONS).toBe(false);
    expect(formatDims(GENERIC_POUCH)).toBe("180 × 140 × 45 mm");
  });
});

describe("fillings scale with the pillow Size (M is the reference)", () => {
  const d = { ...GENERIC_POUCH, widthMm: 200, minWidthMm: 160, lengthMm: 100, thicknessMm: 50, minThicknessMm: 30, flatLengthMm: 180 };

  it("M is identity: the entered millimetres are the M pouch", () => {
    expect(sizeFactors(PILLOW_DIMENSIONS.M)).toEqual({ across: 1, along: 1, thickness: 1 });
    expect(pouchAtSize(d, sizeFactors(PILLOW_DIMENSIONS.M))).toBe(d);
  });

  it("scales across by the pillow width, along by the body length, height by the side gusset", () => {
    for (const size of PILLOW_SIZES) {
      const p = PILLOW_DIMENSIONS[size];
      const s = pouchAtSize(d, sizeFactors(p));
      expect(s.widthMm).toBeCloseTo((200 * p.widthMm) / PILLOW_DIMENSIONS.M.widthMm, 0);
      expect(s.lengthMm).toBeCloseTo((100 * p.lengthMm) / PILLOW_DIMENSIONS.M.lengthMm, 0);
      expect(s.thicknessMm).toBeCloseTo((50 * p.gusset.fullMm) / PILLOW_DIMENSIONS.M.gusset.fullMm, 0);
      expect(s.minThicknessMm).toBeLessThanOrEqual(s.thicknessMm);
      expect(s.minWidthMm).toBeLessThanOrEqual(s.widthMm);
    }
    const xs = pouchAtSize(d, sizeFactors(PILLOW_DIMENSIONS.XS));
    const xl = pouchAtSize(d, sizeFactors(PILLOW_DIMENSIONS.XL));
    expect(xs.widthMm).toBeLessThan(200);
    expect(xl.widthMm).toBeGreaterThan(200);
  });

  it("a pouch lying along the Section scales its width by the length ratio", () => {
    const along = pouchAtSize({ ...d, orientation: "along" }, { across: 2, along: 3, thickness: 1 });
    expect(along.widthMm).toBe(600);
    expect(along.lengthMm).toBe(200);
    expect(along.flatLengthMm).toBe(360);
  });

  it("dimsAtSize reads every item through the Size, the generic pouch for an absent id, once per item", () => {
    const map = new Map([[1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: d }]]);
    const at = dimsAtSize(map, PILLOW_DIMENSIONS.XL);
    expect(at(1)).toBe(at(1));
    expect(at(1).widthMm).toBeGreaterThan(200);
    expect(at(99).widthMm).toBeGreaterThan(GENERIC_POUCH.widthMm);
  });
});
