import { describe, expect, it } from "vitest";

import { isSpatiallyAuthored, isSpatiallyAuthoredCoverage, sectionsInUse } from "../authoring";
import type { PillowPlacement, Section, SubSection } from "../core";

const at = (section: Section, subSection: SubSection, slot: number): PillowPlacement => ({
  section,
  subSection,
  slot,
  itemId: 1,
});

/** The shape the 2026-07-24 backfill produced: cells filled in order, left first. */
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
    expect(sectionsInUse([])).toEqual([]);
  });

  it("collapses many pieces in one Section to that Section", () => {
    expect(sectionsInUse(leftPacked)).toEqual(["left"]);
  });

  it("returns Sections in canonical left → center → right order, not insertion order", () => {
    const placements = [at("right", "front", 1), at("center", "front", 1), at("left", "front", 1)];
    expect(sectionsInUse(placements)).toEqual(["left", "center", "right"]);
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

  it("is true as soon as a second Section is used — the XL spill case", () => {
    expect(isSpatiallyAuthored([...leftPacked, at("center", "front", 1)])).toBe(true);
  });

  it("is true across all three Sections", () => {
    const spread = [at("left", "front", 1), at("center", "middle", 1), at("right", "back", 1)];
    expect(isSpatiallyAuthored(spread)).toBe(true);
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
    expect(isSpatiallyAuthoredCoverage(["left", "center"])).toBe(true);
    expect(isSpatiallyAuthoredCoverage(["left", "center", "right"])).toBe(true);
  });
});
