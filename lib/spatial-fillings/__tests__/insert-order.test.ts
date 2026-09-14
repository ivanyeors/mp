import { describe, it, expect } from "vitest";
import { sectionInsertOrder, setSectionInsertOrder } from "@/lib/configurator/staff-assist";
import {
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  validatePillowPlacements,
  type PillowPlacement,
  type SubSection,
} from "@/lib/spatial-fillings/core";

const L = (subSection: SubSection, slot: number, itemId: number, extra: Partial<PillowPlacement> = {}): PillowPlacement => ({
  section: "left",
  subSection,
  slot,
  itemId,
  ...extra,
});

const cats = new Map([1, 2, 3, 4, 5, 7, 9].map((id) => [id, "filling"]));

describe("insert order", () => {
  const mix: PillowPlacement[] = [
    L("back", 1, 3),
    L("front", 2, 1, { row: 1 }),
    L("front", 1, 2),
    L("middle", 1, 4, { insertOrder: 2 }),
    L("middle", 2, 5, { insertOrder: 1 }),
    { section: "center", subSection: "middle", slot: 1, itemId: 9 },
  ];

  it("authored steps first, then reading order (front→back, top layer, slot)", () => {
    expect(sectionInsertOrder(mix, "left").map((p) => p.itemId)).toEqual([5, 4, 2, 1, 3]);
    expect(sectionInsertOrder(mix, "center").map((p) => p.itemId)).toEqual([9]);
    expect(sectionInsertOrder(mix, "right")).toEqual([]);
  });

  it("setSectionInsertOrder writes 1..n for that Section only; a later piece lands last", () => {
    const ordered = [...sectionInsertOrder(mix, "left")].reverse();
    const next = setSectionInsertOrder(mix, "left", ordered);
    expect(sectionInsertOrder(next, "left").map((p) => p.itemId)).toEqual([3, 1, 2, 4, 5]);
    expect(next.find((p) => p.section === "center")?.insertOrder).toBeUndefined();
    const added = [...next, L("front", 3, 7)];
    expect(sectionInsertOrder(added, "left").map((p) => p.itemId)).toEqual([3, 1, 2, 4, 5, 7]);
  });

  it("round-trips through API rows and validates", () => {
    const rows = pillowPlacementsToRows(mix);
    expect(rows[3].insert_order).toBe(2);
    expect(rows[0].insert_order).toBeNull();
    expect(rowsToPillowPlacements(rows)).toEqual(mix);
    expect(validatePillowPlacements(mix, cats)).toEqual({ ok: true });
    expect(validatePillowPlacements([L("front", 1, 1, { insertOrder: 0 })], cats).ok).toBe(false);
  });
});
