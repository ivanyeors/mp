import { describe, it, expect } from "vitest";
import {
  validateFillingOnlyLines,
  filterSelectableFillingTemplates,
  validateDefaultFillingTemplate,
} from "@/lib/filling-templates";

describe("validateFillingOnlyLines", () => {
  it("accepts empty and filling-only lines", () => {
    expect(validateFillingOnlyLines([])).toEqual({ ok: true });
    expect(
      validateFillingOnlyLines([
        { item_id: 1, category: "filling" },
        { item_id: 2, category: "filling" },
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects non-filling lines", () => {
    const result = validateFillingOnlyLines([
      { item_id: 1, category: "filling" },
      { item_id: 9, category: "packaging" },
      { item_id: 3, category: "protector" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("9");
      expect(result.error).toContain("3");
    }
  });
});

describe("filterSelectableFillingTemplates", () => {
  const rows = [
    { id: 1, kind: "pillow", key: "M", role: "filling", is_active: true, name: "Soft M" },
    { id: 2, kind: "pillow", key: "M", role: "filling", is_active: false, name: "Old M" },
    { id: 3, kind: "pillow", key: "L", role: "filling", is_active: true, name: "Soft L" },
    { id: 4, kind: "bolster", key: "medium", role: "filling", is_active: true, name: "Med" },
    { id: 5, kind: "pillow", key: "M", role: "warehouse", is_active: true, name: "Warehouse M" },
  ];

  it("lists only active filling templates for product type and size", () => {
    const list = filterSelectableFillingTemplates(rows, { productType: "pillow", size: "M" });
    expect(list.map((t) => t.id)).toEqual([1]);
  });

  it("excludes inactive templates", () => {
    const list = filterSelectableFillingTemplates(rows, { productType: "pillow", size: "M" });
    expect(list.some((t) => t.id === 2)).toBe(false);
  });

  it("filters bolster by length key", () => {
    const list = filterSelectableFillingTemplates(rows, { productType: "bolster", size: "medium" });
    expect(list.map((t) => t.id)).toEqual([4]);
  });
});

describe("validateDefaultFillingTemplate", () => {
  const valid = { kind: "pillow", key: "M", role: "filling", is_active: true };

  it("accepts a valid active filling template for the product card scope", () => {
    expect(
      validateDefaultFillingTemplate(valid, {
        productType: "pillow",
        size: "M",
        tier: "basic",
      }),
    ).toEqual({ ok: true });
    expect(
      validateDefaultFillingTemplate(
        { kind: "bolster", key: "medium", role: "filling", is_active: true },
        { productType: "bolster", length: "medium" },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects warehouse role", () => {
    const result = validateDefaultFillingTemplate(
      { ...valid, role: "warehouse" },
      { productType: "pillow", size: "M", tier: "premium" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("role=filling");
  });

  it("rejects inactive templates", () => {
    const result = validateDefaultFillingTemplate(
      { ...valid, is_active: false },
      { productType: "pillow", size: "M", tier: "basic" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("active");
  });

  it("rejects kind mismatch", () => {
    const result = validateDefaultFillingTemplate(
      { kind: "bolster", key: "M", role: "filling", is_active: true },
      { productType: "pillow", size: "M", tier: "basic" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kind");
  });

  it("rejects key mismatch (wrong size or length)", () => {
    const result = validateDefaultFillingTemplate(
      { ...valid, key: "L" },
      { productType: "pillow", size: "M", tier: "basic" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("key");
  });
});
