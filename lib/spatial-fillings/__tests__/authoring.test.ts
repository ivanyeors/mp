import { describe, expect, it } from "vitest";

import {
  isSpatiallyAuthored,
  isSpatiallyAuthoredCoverage,
  looksLikeLegacyImport,
  sectionsInUse,
  sectionsInUsePlacements,
  unauthoredReason,
} from "../authoring";
import type { PillowPlacement, Section, SubSection } from "../core";

const at = (section: Section, subSection: SubSection, slot: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId: 1,
});

const leftPacked: PillowPlacement[] = [
  at("left", "front", 1),
  at("left", "front", 2),
  at("left", "front", 3),
  at("left", "front", 4),
  at("left", "front", 5),
  at("left", "middle", 1),
  at("left", "middle", 2),
  at("left", "middle", 3),
  at("left", "middle", 4),
  at("left", "middle", 5),
  at("left", "back", 1),
];

describe("sectionsInUse", () => {
  it("returns nothing for an empty recipe", () => {
    expect(sectionsInUsePlacements([])).toEqual([]);
  });

  it("collapses many pieces in one Section to that Section", () => {
    expect(sectionsInUsePlacements(leftPacked)).toEqual(["left"]);
  });

  it("returns Sections in canonical left → center → right order, not insertion order", () => {
    const placements = [at("right", "front", 1), at("center", "front", 1), at("left", "front", 1)];
    expect(sectionsInUsePlacements(placements)).toEqual(["left", "center", "right"]);
  });
});

describe("sectionsInUse (coverage form)", () => {
  it("drops nulls and orders canonically", () => {
    expect(sectionsInUse(["right", null, "left", undefined])).toEqual(["left", "right"]);
  });

  it("ignores values that are not Sections", () => {
    expect(sectionsInUse(["compartment", "left"])).toEqual(["left"]);
  });
});

describe("isSpatiallyAuthored", () => {
  it("is false for an empty recipe — nothing placed is not the same as laid out", () => {
    expect(isSpatiallyAuthored([])).toBe(false);
  });

  it("is false for a single piece", () => {
    expect(isSpatiallyAuthored([at("left", "front", 1)])).toBe(false);
  });

  it("is false for the left-packed backfill shape — the ten default templates today", () => {
    expect(isSpatiallyAuthored(leftPacked)).toBe(false);
  });

  it("is false when 15 pieces fill every left cell but never reach center", () => {
    const fullLeft = (["front", "middle", "back"] as SubSection[]).flatMap((sub) =>
      [1, 2, 3, 4, 5].map((slot) => at("left", sub, slot)),
    );
    expect(fullLeft).toHaveLength(15);
    expect(isSpatiallyAuthored(fullLeft)).toBe(false);
  });

  it("is false for the XL spill — left+center with right still empty is the same artefact", () => {
    expect(isSpatiallyAuthored([...leftPacked, at("center", "front", 1)])).toBe(false);
  });

  it("is true across all three Sections", () => {
    const spread = [at("left", "front", 1), at("center", "middle", 1), at("right", "back", 1)];
    expect(isSpatiallyAuthored(spread)).toBe(true);
  });

  it("is true for a symmetric left+right build with an empty center", () => {
    expect(isSpatiallyAuthored([at("left", "front", 1), at("right", "front", 1)])).toBe(true);
  });

  it("is false for center+right — asymmetry is flagged whichever flank is missing", () => {
    expect(isSpatiallyAuthored([at("center", "front", 1), at("right", "front", 1)])).toBe(false);
  });

  it("ignores sub-section spread — three bands in one Section is still unauthored", () => {
    const oneColumn = [at("left", "front", 1), at("left", "middle", 1), at("left", "back", 1)];
    expect(isSpatiallyAuthored(oneColumn)).toBe(false);
  });
});

describe("isSpatiallyAuthoredCoverage", () => {
  it("agrees with the placement-based predicate", () => {
    expect(isSpatiallyAuthoredCoverage([])).toBe(false);
    expect(isSpatiallyAuthoredCoverage(["left"])).toBe(false);
    expect(isSpatiallyAuthoredCoverage(["left", "left"])).toBe(false);
    expect(isSpatiallyAuthoredCoverage(["left", "center"])).toBe(false);
    expect(isSpatiallyAuthoredCoverage(["left", "right"])).toBe(true);
    expect(isSpatiallyAuthoredCoverage(["left", "center", "right"])).toBe(true);
  });

  it("ignores the null section a left join produces for a placement-less template", () => {
    expect(isSpatiallyAuthoredCoverage([null as unknown as string])).toBe(false);
  });

  it("flags all ten default templates and no legitimate build", () => {
    const catalog: Array<[string, string[]]> = [
      ["XS - basic - default", ["left"]],
      ["XS - premium - default", ["left"]],
      ["S - basic - default", ["left"]],
      ["S - premium - default", ["left"]],
      ["M - basic - default", ["left"]],
      ["M - premium - default", ["left"]],
      ["L - basic - default", ["left"]],
      ["L - premium - default", ["left"]],
      ["XL - basic - default", ["left", "center"]],
      ["XL - premium - default", ["left", "center"]],
    ];
    for (const [name, sections] of catalog) {
      expect(isSpatiallyAuthoredCoverage(sections), name).toBe(false);
    }
  });
});

describe("unauthoredReason", () => {
  it("names the single Section a recipe is stuck in", () => {
    expect(unauthoredReason(["left", "left"])).toBe("Every piece sits in the left section.");
  });

  it("names the missing flank for the XL spill rather than claiming one section", () => {
    expect(unauthoredReason(["left", "center"])).toBe(
      "Nothing is placed in the right section, so the two sides are not balanced.",
    );
  });

  it("handles an empty recipe", () => {
    expect(unauthoredReason([])).toBe("No filling pieces have been placed yet.");
  });
});

describe("looksLikeLegacyImport", () => {
  it("is true for the shapes the backfill can actually produce", () => {
    expect(looksLikeLegacyImport(["left"])).toBe(true);
    expect(looksLikeLegacyImport(["left", "center"])).toBe(true);
  });

  it("is false without left — the spread fills left first, so this was placed by hand", () => {
    expect(looksLikeLegacyImport(["center"])).toBe(false);
    expect(looksLikeLegacyImport(["center", "right"])).toBe(false);
    expect(looksLikeLegacyImport([])).toBe(false);
  });

  it("is false once right is used, even though the recipe may still be unbalanced", () => {
    expect(looksLikeLegacyImport(["left", "right"])).toBe(false);
  });
});
