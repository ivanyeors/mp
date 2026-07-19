import { describe, expect, it } from "vitest";

import { FILLING_SHAPE_PATHS } from "@/components/spatial/xray-assets";
import {
  getShapeMorph,
  prepareMorph,
  ringSelfIntersects,
  SHAPE_MORPHS,
  type MorphKey,
} from "@/lib/spatial-fillings/morphs";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

const IDS = Object.keys(FILLING_SHAPE_PATHS) as ShapeId[];

describe("SHAPE_MORPHS pair table", () => {
  it("prepares every ordered pair of distinct shapes at load", () => {
    const expected = IDS.flatMap((a) => IDS.filter((b) => b !== a).map((b) => `${a}->${b}`));
    expect([...SHAPE_MORPHS.keys()].sort()).toEqual(expected.sort());
  });

  it("every entry is interpolator XOR crossfade", () => {
    for (const morph of SHAPE_MORPHS.values()) {
      expect(morph.crossfade).toBe(morph.interpolator === null);
    }
  });

  it("designer shape pairs morph (no crossfade fallback needed)", () => {
    for (const [key, morph] of SHAPE_MORPHS) {
      expect(morph.crossfade, `${key} should have a prepared interpolator`).toBe(false);
    }
  });

  it("reverse morph is the forward interpolator at 1 − t (deterministic)", () => {
    const fwd = SHAPE_MORPHS.get(`${IDS[0]}->${IDS[1]}` as MorphKey)!;
    const rev = SHAPE_MORPHS.get(`${IDS[1]}->${IDS[0]}` as MorphKey)!;
    // exact binary fractions: 1 − 0.75 === 0.25 with no float drift
    expect(fwd.interpolator!(0.25)).toBe(rev.interpolator!(0.75));
    expect(fwd.interpolator!(0.25)).toBe(fwd.interpolator!(0.25));
  });
});

describe("getShapeMorph", () => {
  it("returns null for an unchanged shape (nothing to animate)", () => {
    expect(getShapeMorph("pouch3d", "pouch3d")).toBeNull();
  });

  it("returns the prepared entry for a swap", () => {
    const morph = getShapeMorph("pouch3d", "pouch6d");
    expect(morph).toBe(SHAPE_MORPHS.get("pouch3d->pouch6d"));
  });
});

describe("prepareMorph degeneracy fallback", () => {
  it("valid convex pair yields mid-frames that are closed finite paths", () => {
    const morph = prepareMorph("M0 0 L40 0 L40 40 L0 40 Z", "M20 0 L40 20 L20 40 L0 20 Z");
    expect(morph.crossfade).toBe(false);
    expect(morph.interpolator!(0.5)).toMatch(/^M/);
  });

  it("unparseable path falls back to crossfade", () => {
    const morph = prepareMorph("not a path", FILLING_SHAPE_PATHS.pouch3d);
    expect(morph).toEqual({ interpolator: null, crossfade: true });
  });

  it("self-intersecting mid-frames fall back to crossfade", () => {
    // opposing horseshoes: linear vertex motion crosses itself mid-morph
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
