import { describe, expect, it } from "vitest";

import {
  normalizeHexColor,
  OverlayColorSchema,
  overlayFamilies,
  overlayShips,
  overlaySignature,
  overlayState,
  overlaysDiffer,
  type OverlayFit,
  type OverlayMappingItem,
} from "./overlays";

const ASSET = "00000000-0000-4000-8000-000000000001";

function item(
  id: number,
  name: string,
  size: string | null,
  mapping: OverlayMappingItem["mapping"] = null,
  category = "pillow_case",
): OverlayMappingItem {
  return { id, name, category, size, mapping };
}

const image = (fit: OverlayFit | null = null) => ({
  media_asset_id: ASSET,
  hosted_url: "https://cdn.example/fibrecool.webp",
  color: null,
  fit,
});
const color = (c: string) => ({ media_asset_id: null, hosted_url: null, color: c, fit: null });

describe("overlayFamilies", () => {
  it("groups sizes of the same (category, name) and orders them XS → XL", () => {
    const families = overlayFamilies([
      item(1, "Fibrecool", "S"),
      item(2, "Fibrecool", "M"),
      item(3, "Fibrecool", "L"),
      item(4, "Fibrecool", "XS"),
      item(5, "Deep Blue Linen", "XS"),
    ]);
    expect(families.map((f) => f.name)).toEqual(["Fibrecool", "Deep Blue Linen"]);
    expect(families[0]!.items.map((i) => i.size)).toEqual(["XS", "S", "M", "L"]);
  });

  it("keeps a pillow case and a bolster case of the same name apart", () => {
    const families = overlayFamilies([
      item(1, "Camel", "S", null, "pillow_case"),
      item(2, "Camel", "S", null, "bolster_case"),
    ]);
    expect(families).toHaveLength(2);
  });

  it("sorts unknown sizes after the known ones", () => {
    const [family] = overlayFamilies([
      item(1, "Duo", "Custom"),
      item(2, "Duo", null),
      item(3, "Duo", "XL"),
    ]);
    expect(family!.items.map((i) => i.size)).toEqual(["XL", null, "Custom"]);
  });
});

describe("overlay state", () => {
  it("tells image, color, missing asset and unmapped apart", () => {
    expect(overlayState(image())).toBe("image");
    expect(overlayState(color("#1f3a5f"))).toBe("color");
    expect(overlayState({ ...image(), hosted_url: null })).toBe("missing");
    expect(overlayState(null)).toBe("none");
  });

  it("only counts overlays the configurator actually draws", () => {
    expect(overlayShips(item(1, "A", "S", image()))).toBe(true);
    expect(overlayShips(item(1, "A", "S", color("#ffffff")))).toBe(true);
    expect(overlayShips(item(1, "A", "S", { ...image(), hosted_url: null }))).toBe(false);
    expect(overlayShips(item(1, "A", "S"))).toBe(false);
  });
});

describe("overlaysDiffer", () => {
  it("treats an identity fit and no fit as the same placement", () => {
    expect(overlaySignature(image(null))).toBe(overlaySignature(image({ scale: 1, x: 0 })));
    expect(
      overlaysDiffer([item(1, "A", "S", image(null)), item(2, "A", "M", image({}))]),
    ).toBe(false);
  });

  it("flags a family whose sizes carry different overlays", () => {
    expect(
      overlaysDiffer([item(1, "A", "S", image()), item(2, "A", "M", image({ scale: 1.2 }))]),
    ).toBe(true);
    expect(overlaysDiffer([item(1, "A", "S", image()), item(2, "A", "M")])).toBe(true);
    expect(
      overlaysDiffer([item(1, "A", "S", color("#000000")), item(2, "A", "M", color("#000000"))]),
    ).toBe(false);
  });
});

describe("colors", () => {
  it("normalizes typed hex input", () => {
    expect(normalizeHexColor("#1F3A5F")).toBe("#1f3a5f");
    expect(normalizeHexColor("1f3a5f")).toBe("#1f3a5f");
    expect(normalizeHexColor(" fff ")).toBe("#ffffff");
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("blue")).toBeNull();
  });

  it("stores colors lowercase so the DB check accepts them", () => {
    expect(OverlayColorSchema.parse("#ABCDEF")).toBe("#abcdef");
    expect(OverlayColorSchema.safeParse("#abc").success).toBe(false);
  });
});
