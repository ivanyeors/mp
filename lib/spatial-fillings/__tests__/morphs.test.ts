import { describe, expect, it } from "vitest";

import { FILLING_SHAPE_PATHS } from "@/components/spatial/xray-assets";
import {
  getShapeMorph,
  prepareMorph,
  ringSelfIntersects,
  SHAPE_MORPHS,
} from "@/lib/spatial-fillings/morphs";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

const IDS = Object.keys(FILLING_SHAPE_PATHS) as ShapeId[];

describe("SHAPE_MORPHS pair table", () => {
  // ponytail: single pouch shape today → empty pair table; the table contract
  // and the interpolation machinery stay covered so designer shapes drop in.
  it("prepares every ordered pair of distinct shapes at load", () => {
    const expected = IDS.flatMap((a) => IDS.filter((b) => b !== a).map((b) => `${a}->${b}`));
    expect([...SHAPE_MORPHS.keys()].sort()).toEqual(expected.sort());
  });

  it("every entry is interpolator XOR crossfade", () => {
    for (const morph of SHAPE_MORPHS.values()) {
      expect(morph.crossfade).toBe(morph.interpolator === null);
    }
  });

  it("prepared morphs are deterministic frame-for-frame", () => {
    const morph = prepareMorph(FILLING_SHAPE_PATHS.pouch, "M20 0 L40 20 L20 40 L0 20 Z");
    expect(morph.crossfade).toBe(false);
    expect(morph.interpolator!(0.25)).toBe(morph.interpolator!(0.25));
  });
});

describe("getShapeMorph", () => {
  it("returns null for an unchanged shape (nothing to animate)", () => {
    expect(getShapeMorph("pouch", "pouch")).toBeNull();
  });

  it("falls back to crossfade for a pair missing from the table", () => {
    expect(getShapeMorph("pouch", "future-shape" as ShapeId)).toEqual({
      interpolator: null,
      crossfade: true,
    });
  });
});

describe("prepareMorph degeneracy fallback", () => {
  it("valid convex pair yields mid-frames that are closed finite paths", () => {
    const morph = prepareMorph("M0 0 L40 0 L40 40 L0 40 Z", "M20 0 L40 20 L20 40 L0 20 Z");
    expect(morph.crossfade).toBe(false);
    expect(morph.interpolator!(0.5)).toMatch(/^M/);
  });

  it("unparseable path falls back to crossfade", () => {
    const morph = prepareMorph("not a path", FILLING_SHAPE_PATHS.pouch);
    expect(morph).toEqual({ interpolator: null, crossfade: true });
  });

  it("self-intersecting mid-frames fall back to crossfade", () => {
    const morph = prepareMorph(
      "M10 10 L90 10 L90 30 L30 30 L30 70 L90 70 L90 90 L10 90 Z",
      "M90 10 L10 10 L10 30 L70 30 L70 70 L10 70 L10 90 L90 90 Z",
    );
    expect(morph).toEqual({ interpolator: null, crossfade: true });
  });
});

describe("ringSelfIntersects", () => {
  it("square does not self-intersect", () => {
    expect(
      ringSelfIntersects([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(false);
  });

  it("bowtie self-intersects", () => {
    expect(
      ringSelfIntersects([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(true);
  });
});
