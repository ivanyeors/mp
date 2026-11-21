import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MorphKey } from "@/lib/spatial-fillings/morphs";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

const interpolateSpy = vi.fn((from: string, to: string) => {
  void from;
  void to;
  return () => "M0 0 L10 0 L10 10 L0 10 Z";
});

vi.mock("flubber", () => ({ interpolate: (...args: [string, string]) => interpolateSpy(...args) }));

vi.mock("@/components/spatial/xray-assets", () => ({
  FILLING_SHAPE_PATHS: {
    pouch: "M0 0 L40 0 L40 40 L0 40 Z",
    wedge: "M20 0 L40 20 L20 40 L0 20 Z",
  },
}));

describe("SHAPE_MORPHS preparation is lazy", () => {
  beforeEach(() => {
    interpolateSpy.mockClear();
    vi.resetModules();
  });

  it("does no flubber work at import time", async () => {
    await import("@/lib/spatial-fillings/morphs");
    expect(interpolateSpy).not.toHaveBeenCalled();
  });

  it("builds the table on the first getShapeMorphs() call, then caches it", async () => {
    const { getShapeMorphs } = await import("@/lib/spatial-fillings/morphs");
    expect(interpolateSpy).not.toHaveBeenCalled();

    const first = getShapeMorphs();
    const callsAfterFirst = interpolateSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = getShapeMorphs();
    expect(second).toBe(first);
    expect(interpolateSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("builds the table on the first getShapeMorph() call, not before", async () => {
    const { getShapeMorph } = await import("@/lib/spatial-fillings/morphs");
    expect(interpolateSpy).not.toHaveBeenCalled();

    expect(getShapeMorph("pouch", "pouch")).toBeNull();
    expect(interpolateSpy).not.toHaveBeenCalled();

    expect(getShapeMorph("pouch", "wedge" as ShapeId)).not.toBeNull();
    expect(interpolateSpy).toHaveBeenCalled();
  });

  it("the SHAPE_MORPHS back-compat view stays lazy but reads like a Map", async () => {
    const { SHAPE_MORPHS, getShapeMorphs } = await import("@/lib/spatial-fillings/morphs");
    expect(interpolateSpy).not.toHaveBeenCalled();

    expect(SHAPE_MORPHS.size).toBe(2);
    expect(interpolateSpy).toHaveBeenCalled();

    const real = getShapeMorphs();
    expect([...SHAPE_MORPHS.keys()].sort()).toEqual(["pouch->wedge", "wedge->pouch"]);
    expect([...SHAPE_MORPHS.entries()]).toEqual([...real.entries()]);
    expect(SHAPE_MORPHS.get("pouch->wedge" as MorphKey)).toBe(real.get("pouch->wedge" as MorphKey));
    expect(SHAPE_MORPHS.has("pouch->wedge" as MorphKey)).toBe(true);
    for (const [key, morph] of SHAPE_MORPHS) {
      expect(typeof key).toBe("string");
      expect(morph.crossfade).toBe(morph.interpolator === null);
    }
  });
});
