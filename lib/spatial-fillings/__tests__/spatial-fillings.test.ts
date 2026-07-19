import { describe, it, expect } from "vitest";
import {
  validatePillowPlacements,
  validateBolsterPlacements,
  flattenToPackList,
  derivePackList,
  placementsExactMatch,
  type PillowPlacement,
  type BolsterPlacement,
  type Section,
  type SubSection,
} from "@/lib/spatial-fillings";
import { fingerprintPlacements } from "@/lib/spatial-fillings/fingerprint";

const categories = new Map([
  [1, "filling"],
  [2, "filling"],
  [3, "filling"],
  [9, "packaging"],
]);

const SECTIONS: Section[] = ["left", "center", "right"];
const SUB_SECTIONS: SubSection[] = ["front", "middle", "back"];

/** All nine cells: 5× item 1 in left/front, one item 2 in each other cell. */
function nineCells(): PillowPlacement[] {
  const placements: PillowPlacement[] = [];
  for (const section of SECTIONS) {
    for (const subSection of SUB_SECTIONS) {
      if (section === "left" && subSection === "front") {
        for (let slot = 1; slot <= 5; slot++) placements.push({ section, subSection, slot, itemId: 1 });
      } else {
        placements.push({ section, subSection, slot: 1, itemId: 2 });
      }
    }
  }
  return placements;
}

describe("validatePillowPlacements", () => {
  it("accepts all nine cells including the same item repeated 5x in one cell", () => {
    expect(validatePillowPlacements(nineCells(), categories)).toEqual({ ok: true });
    expect(validatePillowPlacements([], categories)).toEqual({ ok: true });
  });

  it("rejects a 6th piece in a cell", () => {
    const result = validatePillowPlacements(
      [...nineCells(), { section: "left", subSection: "front", slot: 6, itemId: 1 }],
      categories,
    );
    expect(result.ok).toBe(false);

    const duplicateSlot = validatePillowPlacements(
      [...nineCells(), { section: "left", subSection: "front", slot: 5, itemId: 2 }],
      categories,
    );
    expect(duplicateSlot.ok).toBe(false);
  });

  it("rejects non-filling and unknown items", () => {
    const packaging = validatePillowPlacements(
      [{ section: "left", subSection: "front", slot: 1, itemId: 9 }],
      categories,
    );
    expect(packaging.ok).toBe(false);
    if (!packaging.ok) expect(packaging.error).toContain("9");

    const unknown = validatePillowPlacements(
      [{ section: "left", subSection: "front", slot: 1, itemId: 99 }],
      categories,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain("99");
  });

  it("rejects bad cell addresses", () => {
    const badSection = validatePillowPlacements(
      [{ section: "middle" as Section, subSection: "front", slot: 1, itemId: 1 }],
      categories,
    );
    expect(badSection.ok).toBe(false);

    const badSubSection = validatePillowPlacements(
      [{ section: "left", subSection: "top" as SubSection, slot: 1, itemId: 1 }],
      categories,
    );
    expect(badSubSection.ok).toBe(false);
  });

  it("rejects out-of-range and non-integer slots", () => {
    expect(
      validatePillowPlacements([{ section: "left", subSection: "front", slot: 0, itemId: 1 }], categories).ok,
    ).toBe(false);
    expect(
      validatePillowPlacements([{ section: "left", subSection: "front", slot: 1.5, itemId: 1 }], categories).ok,
    ).toBe(false);
  });
});

describe("validateBolsterPlacements", () => {
  it("accepts many slots — no piece cap in v1", () => {
    const placements: BolsterPlacement[] = Array.from({ length: 12 }, (_, i) => ({
      slot: i + 1,
      itemId: 1,
    }));
    expect(validateBolsterPlacements(placements, categories)).toEqual({ ok: true });
  });

  it("rejects duplicate slots, slot < 1, and non-filling items", () => {
    expect(
      validateBolsterPlacements(
        [
          { slot: 1, itemId: 1 },
          { slot: 1, itemId: 2 },
        ],
        categories,
      ).ok,
    ).toBe(false);
    expect(validateBolsterPlacements([{ slot: 0, itemId: 1 }], categories).ok).toBe(false);
    expect(validateBolsterPlacements([{ slot: 1, itemId: 9 }], categories).ok).toBe(false);
  });
});

describe("flattenToPackList / derivePackList", () => {
  it("flattens placements to item_id x count, sorted", () => {
    expect(flattenToPackList(nineCells())).toEqual([
      { item_id: 1, count: 5 },
      { item_id: 2, count: 8 },
    ]);
  });

  it("derives from placements when present, legacy lines otherwise", () => {
    const rows = [
      { item_id: 2, section: "left", sub_section: "front", slot: 1 },
      { item_id: 2, section: "left", sub_section: "front", slot: 2 },
    ];
    const lines = [{ item_id: 9, quantity: 4 }];
    expect(derivePackList(rows, lines)).toEqual([{ item_id: 2, count: 2 }]);
    expect(derivePackList([], lines)).toEqual([{ item_id: 9, count: 4 }]);
    expect(derivePackList([], [])).toEqual([]);
  });
});

describe("placementsExactMatch", () => {
  it("ignores slot numbering and row order within a cell", () => {
    const a: PillowPlacement[] = [
      { section: "left", subSection: "front", slot: 1, itemId: 1 },
      { section: "left", subSection: "front", slot: 2, itemId: 2 },
    ];
    const b: PillowPlacement[] = [
      { section: "left", subSection: "front", slot: 4, itemId: 2 },
      { section: "left", subSection: "front", slot: 5, itemId: 1 },
    ];
    expect(placementsExactMatch(a, b)).toBe(true);
  });

  it("distinguishes the same items in different cells", () => {
    const a: PillowPlacement[] = [{ section: "left", subSection: "front", slot: 1, itemId: 1 }];
    const b: PillowPlacement[] = [{ section: "left", subSection: "back", slot: 1, itemId: 1 }];
    expect(placementsExactMatch(a, b)).toBe(false);
  });
});

describe("fingerprintPlacements", () => {
  it("is stable across semantically identical orderings", () => {
    const shuffled = [...nineCells()].reverse();
    const renumbered = nineCells().map((p) =>
      p.section === "left" && p.subSection === "front" ? { ...p, slot: 6 - p.slot } : p,
    );
    expect(fingerprintPlacements(shuffled)).toBe(fingerprintPlacements(nineCells()));
    expect(fingerprintPlacements(renumbered)).toBe(fingerprintPlacements(nineCells()));
  });

  it("differs across different mixes", () => {
    const base = nineCells();
    const differentItem = nineCells().map((p, i) => (i === 0 ? { ...p, itemId: 3 } : p));
    const movedCell: PillowPlacement[] = [
      ...nineCells(),
      { section: "right", subSection: "back", slot: 2, itemId: 1 },
    ];
    expect(fingerprintPlacements(differentItem)).not.toBe(fingerprintPlacements(base));
    expect(fingerprintPlacements(movedCell)).not.toBe(fingerprintPlacements(base));
  });

  it("fingerprints bolster placements independently of slot order", () => {
    const a: BolsterPlacement[] = [
      { slot: 1, itemId: 1 },
      { slot: 2, itemId: 2 },
    ];
    const b: BolsterPlacement[] = [
      { slot: 9, itemId: 2 },
      { slot: 3, itemId: 1 },
    ];
    expect(fingerprintPlacements(a)).toBe(fingerprintPlacements(b));
    expect(fingerprintPlacements(a)).not.toBe(fingerprintPlacements([{ slot: 1, itemId: 1 }]));
  });
});
