import { describe, expect, it } from "vitest";

import { cellLayers, mirrorSection, mirrorTarget } from "@/lib/configurator/staff-assist";
import { flattenToPackList, SUB_SECTIONS } from "@/lib/spatial-fillings/core";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

const authored: PillowPlacement[] = [
  { section: "right", subSection: "front", slot: 1, itemId: 11, insertOrder: 1 },
  { section: "right", subSection: "middle", slot: 1, itemId: 22, row: 0, insertOrder: 2 },
  { section: "right", subSection: "middle", slot: 2, itemId: 22, row: 1, insertOrder: 3 },
  { section: "right", subSection: "back", slot: 1, itemId: 33, row: 0 },
  { section: "right", subSection: "back", slot: 2, itemId: 44, row: 1 },
  { section: "center", subSection: "middle", slot: 1, itemId: 99 },
];

const inSection = (ps: PillowPlacement[], section: string) =>
  ps
    .filter((p) => p.section === section)
    .sort(
      (a, b) =>
        SUB_SECTIONS.indexOf(a.subSection) - SUB_SECTIONS.indexOf(b.subSection) || a.slot - b.slot,
    );

describe("mirrorTarget", () => {
  it("pairs the two sides and leaves center unpaired", () => {
    expect(mirrorTarget("left")).toBe("right");
    expect(mirrorTarget("right")).toBe("left");
    expect(mirrorTarget("center")).toBeNull();
  });
});

describe("mirrorSection", () => {
  it("copies every cell, layer, slot and insert order onto the far side", () => {
    const next = mirrorSection(authored, "right");
    const right = inSection(next, "right");
    const left = inSection(next, "left");
    expect(left).toEqual(right.map((p) => ({ ...p, section: "left" })));
    expect(cellLayers(next, { section: "left", subSection: "back" }).map((l) => l.map((p) => p.itemId)))
      .toEqual([[33], [44]]);
    expect(left.map((p) => p.subSection)).toEqual(["front", "middle", "middle", "back", "back"]);
    expect(left.map((p) => p.insertOrder)).toEqual(right.map((p) => p.insertOrder));
  });

  it("leaves the source side and center untouched", () => {
    const next = mirrorSection(authored, "right");
    expect(inSection(next, "right")).toEqual(inSection(authored, "right"));
    expect(inSection(next, "center")).toEqual(inSection(authored, "center"));
  });

  it("REPLACES the far side rather than merging into it", () => {
    const both: PillowPlacement[] = [
      ...authored,
      { section: "left", subSection: "front", slot: 1, itemId: 77 },
      { section: "left", subSection: "front", slot: 2, itemId: 88 },
    ];
    const left = inSection(mirrorSection(both, "right"), "left");
    expect(left.map((p) => p.itemId)).toEqual([11, 22, 22, 33, 44]);
    expect(left.some((p) => p.itemId === 77 || p.itemId === 88)).toBe(false);
  });

  it("is idempotent, and mirroring back is a no-op once the sides match", () => {
    const once = mirrorSection(authored, "right");
    expect(inSection(mirrorSection(once, "right"), "left")).toEqual(inSection(once, "left"));
    expect(inSection(mirrorSection(once, "left"), "right")).toEqual(inSection(once, "right"));
  });

  it("refuses center in both directions — it has no opposite side", () => {
    expect(mirrorSection(authored, "center")).toBe(authored);
  });

  it("refuses an empty source, which would silently clear the other side", () => {
    expect(mirrorSection(authored, "left")).toBe(authored);
  });

  it("doubles the pack list, because mirroring adds real pieces", () => {
    const before = flattenToPackList(authored);
    const after = flattenToPackList(mirrorSection(authored, "right"));
    const countOf = (lines: ReturnType<typeof flattenToPackList>, id: number) =>
      lines.find((l) => l.item_id === id)?.count ?? 0;
    expect(countOf(before, 22)).toBe(2);
    expect(countOf(after, 22)).toBe(4);
    expect(countOf(after, 99)).toBe(countOf(before, 99));
  });
});
