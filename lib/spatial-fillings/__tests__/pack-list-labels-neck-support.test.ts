import { describe, expect, it } from "vitest";

import { removeFilling } from "@/lib/configurator/staff-assist";
import { pouchOutline, type Pt } from "../conform";
import {
  flattenToPackList,
  placementKind,
  validateBolsterPlacements,
  validatePillowPlacements,
  type PillowPlacement,
} from "../core";
import {
  fillingFamily,
  fillingItemsToSunburst,
  fillingLabel,
  fillingLabelLines,
  isNeckSupportItem,
  pieceLabelLines,
} from "../filling-groups";
import { fillingVisual } from "../visuals";

const neck = (id: number, size: string) => ({
  id,
  category: "accessories",
  name: "Cervical Neck Support",
  subtype: null,
  size,
});

describe("removeFilling", () => {
  it("drops every piece of one filling and closes emptied layers", () => {
    const placements: PillowPlacement[] = [
      { section: "left", subSection: "front", slot: 1, itemId: 7, row: 0 },
      { section: "left", subSection: "front", slot: 2, itemId: 9, row: 1 },
      { section: "center", subSection: "back", slot: 1, itemId: 7 },
      { section: "center", subSection: "back", slot: 2, itemId: 8 },
    ];
    const next = removeFilling(placements, 7);
    expect(flattenToPackList(next)).toEqual([
      { item_id: 8, count: 1 },
      { item_id: 9, count: 1 },
    ]);
    expect(next.find((p) => p.itemId === 9)?.row).toBeUndefined();
  });

  it("works on a bolster mix", () => {
    expect(removeFilling([{ slot: 1, itemId: 3 }, { slot: 2, itemId: 4 }], 3)).toEqual([
      { slot: 2, itemId: 4 },
    ]);
  });
});

describe("labels", () => {
  it("adds the size unless the type already says it", () => {
    expect(fillingLabelLines("6D Fold", "S")).toEqual(["6D Fold", "S"]);
    expect(fillingLabelLines("6D (L)", "L")).toEqual(["6D (L)"]);
    expect(fillingLabelLines("6D-L+", null)).toEqual(["6D-L+"]);
    expect(fillingLabelLines("", "S")).toEqual([]);
  });

  it("names live inventory (type in `name`, subtype null) apart by size", () => {
    expect(fillingLabel({ id: 55, name: "6D", subtype: null, size: "L" })).toBe("6D L");
    expect(fillingLabel({ id: 67, name: "6D", subtype: null, size: "S" })).toBe("6D S");
  });
});

describe("family colors", () => {
  it("colors live inventory by family, not grey", () => {
    const grey = fillingVisual(null).defaultColor;
    expect(fillingVisual("6D").defaultColor).not.toBe(grey);
    expect(fillingVisual("6D Fold").defaultColor).toBe(fillingVisual("6D").defaultColor);
    expect(fillingVisual("3D Round").defaultColor).toBe(fillingVisual("3D").defaultColor);
    expect(fillingVisual("6D+").defaultColor).not.toBe(fillingVisual("6D").defaultColor);
    expect(fillingVisual("6F").defaultColor).not.toBe(grey);
    expect(fillingVisual("6F").defaultColor).toBe(fillingVisual("6F Long").defaultColor);
  });
});

describe("Cervical Neck Support", () => {
  it("is its own family, drawn as a pill", () => {
    expect(fillingFamily("Cervical Neck Support")).toEqual({ key: "neck", label: "Neck support" });
    expect(fillingVisual("Cervical Neck Support").shape).toBe("pill");
    expect(fillingVisual("6D").shape).toBe("pouch");
  });

  it("shows in the add menu as one group with a leaf per size", () => {
    const tree = fillingItemsToSunburst([
      { id: 55, name: "6D", subtype: null, size: "L" },
      neck(61, "S"),
      neck(63, "L"),
    ]);
    const group = tree.find((n) => n.id === "fam:neck");
    expect(group?.label).toBe("Neck support");
    expect(group?.children?.map((c) => c.label)).toEqual(["S", "L"]);
    expect(tree.at(-1)?.id).toBe("fam:neck");
  });

  it("is only a neck support when it is an accessory", () => {
    expect(isNeckSupportItem(neck(61, "S"))).toBe(true);
    expect(isNeckSupportItem({ category: "filling", name: "Cervical Neck Support" })).toBe(false);
    expect(isNeckSupportItem({ category: "accessories", name: "Pillow spray" })).toBe(false);
  });

  it("may be placed; other accessories may not", () => {
    const kinds = new Map([
      [61, placementKind(neck(61, "S"))],
      [70, placementKind({ category: "accessories", name: "Pillow spray" })],
      [55, placementKind({ category: "filling", name: "6D" })],
    ]);
    const at = (itemId: number, slot: number): PillowPlacement => ({
      section: "center",
      subSection: "front",
      slot,
      itemId,
    });
    expect(validatePillowPlacements([at(55, 1), at(61, 2)], kinds)).toEqual({ ok: true });
    expect(validatePillowPlacements([at(55, 1), at(61, 2)], kinds, { tier: "premium" })).toEqual({ ok: true });
    expect(validatePillowPlacements([at(70, 1)], kinds).ok).toBe(false);
  });

  it("is premium pillows only: never basic, never a bolster", () => {
    const kinds = new Map([
      [61, placementKind(neck(61, "S"))],
      [55, placementKind({ category: "filling", name: "6D" })],
    ]);
    const basic = validatePillowPlacements(
      [{ section: "center", subSection: "front", slot: 1, itemId: 61 }],
      kinds,
      { tier: "basic" },
    );
    expect(basic).toEqual({ ok: false, error: "A Cervical Neck Support is for premium pillows only" });
    expect(validateBolsterPlacements([{ slot: 1, itemId: 61 }], kinds).ok).toBe(false);
    expect(validateBolsterPlacements([{ slot: 1, itemId: 55 }], kinds)).toEqual({ ok: true });
  });

  it("is a full capsule of its rect: the registry footprint, round ends, no aspect cap (slice 02)", () => {
    const bbox = (pts: Pt[]) => {
      const xs = pts.map(([x]) => x);
      const ys = pts.map(([, y]) => y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const square = { x: 0, y: 0, w: 66, h: 66 };
    expect(bbox(pouchOutline(square))).toEqual({ w: 66, h: 66 });
    const wide = bbox(pouchOutline({ x: 0, y: 0, w: 300, h: 90 }, 5, "pill"));
    expect(wide.w).toBeCloseTo(300);
    expect(wide.h).toBeCloseTo(90);
    const tall = bbox(pouchOutline({ x: 0, y: 0, w: 40, h: 120 }, 5, "pill"));
    expect(tall.h).toBeCloseTo(120);
    expect(tall.w).toBeCloseTo(40);
    const pts = pouchOutline({ x: 0, y: 0, w: 40, h: 120 }, 5, "pill");
    expect(pts.some(([x, y]) => Math.hypot(x, y) < 5)).toBe(false);
  });

  it("is labelled \"Neck\" inside the piece, in full elsewhere", () => {
    expect(pieceLabelLines("Cervical Neck Support", "M")).toEqual(["Neck", "M"]);
    expect(pieceLabelLines("6D Fold", "S")).toEqual(["6D Fold", "S"]);
    expect(fillingLabel(neck(62, "M"))).toBe("Cervical Neck Support M");
  });
});
