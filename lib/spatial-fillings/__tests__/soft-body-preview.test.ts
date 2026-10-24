import { describe, expect, it } from "vitest";

import { placementKind, SECTIONS, validatePillowPlacements } from "../core";
import type { DimensionsPayload } from "../dimension-overrides";
import { CODE_REGISTRY, resolveDims } from "../dimensions";
import { fitPillow } from "../fit";
import {
  DEFAULT_SAMPLE_RECIPE,
  recipePlacements,
  registryFromCatalog,
  sampleItemMaps,
  sampleRecipe,
  SOFT_BODY_RECIPES,
  SOFT_BODY_SAMPLE_ITEMS,
} from "../soft-body-preview";

const categories = new Map(SOFT_BODY_SAMPLE_ITEMS.map((i) => [i.id, placementKind({ category: i.category ?? "filling", name: i.name })]));

describe("recipePlacements", () => {
  it("lists each column top → bottom as Layers 0…n with slot = Layer + 1, in the chosen Section", () => {
    expect(recipePlacements(sampleRecipe("type-8"), "center")).toEqual([
      { section: "center", subSection: "front", slot: 1, itemId: 1, row: 0, insertOrder: 1 },
      { section: "center", subSection: "middle", slot: 1, itemId: 2, row: 0, insertOrder: 2 },
      { section: "center", subSection: "back", slot: 1, itemId: 1, row: 0, insertOrder: 3 },
      { section: "center", subSection: "back", slot: 2, itemId: 1, row: 1, insertOrder: 4 },
    ]);
  });

  it("keeps the Neck mix's authored insert order, which is not reading order", () => {
    const steps = recipePlacements(sampleRecipe("neck-mix"), "left")
      .sort((a, b) => a.insertOrder! - b.insertOrder!)
      .map((p) => `${p.subSection}/${p.row}:${p.itemId}`);
    expect(steps).toEqual(["middle/1:4", "middle/0:1", "front/1:2", "front/0:1", "back/2:1", "back/1:1", "back/0:3"]);
  });

  it.each(SOFT_BODY_RECIPES.map((r) => [r.name, r] as const))("%s is a valid recipe in every Section, insert order 1…n", (_name, recipe) => {
    for (const section of SECTIONS) {
      const placements = recipePlacements(recipe, section);
      expect(placements.every((p) => p.section === section)).toBe(true);
      expect(validatePillowPlacements(placements, categories)).toEqual({ ok: true });
      const orders = placements.map((p) => p.insertOrder).sort((a, b) => a! - b!);
      expect(orders).toEqual(placements.map((_, i) => i + 1));
    }
  });

  it("falls back to the default recipe for an unknown key", () => {
    expect(sampleRecipe("nope").key).toBe(DEFAULT_SAMPLE_RECIPE);
    expect(sampleRecipe(null).name).toBe("Type 11");
  });

  it("fits only the cut Section", () => {
    const { itemDims } = sampleItemMaps();
    const fit = fitPillow(recipePlacements(sampleRecipe(DEFAULT_SAMPLE_RECIPE), "right"), { size: "M", dims: itemDims });
    expect(new Set(fit.cells.map((c) => c.section))).toEqual(new Set(["right"]));
    expect(fit.sections.right.pieces).toHaveLength(6);
  });
});

describe("sampleItemMaps", () => {
  it("labels the fold apart from the plain 6D and resolves each Item as the testing preview did", () => {
    const { itemSubtypes, itemSizes, itemDims } = sampleItemMaps();
    expect([...itemSubtypes]).toEqual([[1, "6D"], [2, "6D Fold"], [3, "3D"], [4, "Cervical Neck Support"]]);
    expect(itemSizes.get(4)).toBe("M");
    expect([1, 2, 3, 4].map((id) => itemDims.get(id)?.key)).toEqual(["6d/s", "6d/s", "3d/s", "neck/m"]);
    expect(itemDims.get(4)?.kind).toBe("neck");
  });
});

describe("registryFromCatalog", () => {
  const payload: Pick<DimensionsPayload, "pouches" | "neck" | "loftAllowance"> = {
    pouches: [
      {
        key: "6d/s",
        label: "6D (S)",
        dims: { widthMm: 200, lengthMm: 150, thicknessMm: 50, minThicknessMm: 30, minWidthMm: 170 },
        source: "configured",
        measuredOn: "2026-10-01",
      },
      {
        key: "3d/s",
        label: "3D (S)",
        dims: { widthMm: 1, lengthMm: 1, thicknessMm: 1, minThicknessMm: 1, minWidthMm: 1 },
        source: "unmeasured",
        measuredOn: null,
      },
    ],
    neck: [{ size: "M", dims: { lengthMm: 320, radiusMm: 30, minRadiusMm: 20 }, source: "configured", measuredOn: null }],
    loftAllowance: 0.15,
  };

  it("applies configured rows over the code defaults and leaves the rest to the code", () => {
    const registry = registryFromCatalog(payload);
    const { itemDims } = sampleItemMaps(registry);
    expect(itemDims.get(1)).toMatchObject({ source: "configured", dims: { widthMm: 200, thicknessMm: 50 } });
    expect(itemDims.get(3)).toEqual(resolveDims({ name: "3D (S)", category: "filling" }));
    expect(itemDims.get(4)).toMatchObject({ kind: "neck", source: "configured", dims: { widthMm: 320, thicknessMm: 60 } });
    expect(registry.loftAllowance).toBe(0.15);
  });

  it("is the code registry without a payload", () => {
    expect(registryFromCatalog(null)).toBe(CODE_REGISTRY);
  });
});
