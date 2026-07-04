import { describe, it, expect } from "vitest";
import { BOLSTER_LENGTHS, isBolsterLength } from "@/lib/results/composed-sellable";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { assembleBuild } from "@/lib/build-assembly";
import { priceResult } from "@/lib/result-pricing";

describe("slice 09 — mbolster composed sellable", () => {
  it("accepts only short/medium/long lengths", () => {
    expect(BOLSTER_LENGTHS).toEqual(["short", "medium", "long"]);
    expect(isBolsterLength("medium")).toBe(true);
    expect(isBolsterLength("M")).toBe(false);
    expect(isBolsterLength("basic")).toBe(false);
  });

  it("filters Filling Templates by bolster + length key", () => {
    const templates = [
      { id: 1, kind: "bolster", key: "medium", role: "filling", is_active: true },
      { id: 2, kind: "bolster", key: "short", role: "filling", is_active: true },
      { id: 3, kind: "pillow", key: "M", role: "filling", is_active: true },
      { id: 4, kind: "bolster", key: "medium", role: "base", is_active: true },
    ];
    const selectable = filterSelectableFillingTemplates(templates, {
      productType: "bolster",
      size: "medium",
    });
    expect(selectable.map((t) => t.id)).toEqual([1]);
  });

  it("assembles bolster build from length BOM + filling template + prefs (no customer fillings)", () => {
    const assembled = assembleBuild({
      composedBomLines: [
        { item_id: 10, quantity: 1, category: "cover" },
        { item_id: 11, quantity: 1, category: "bolster_protector" },
        { item_id: 99, quantity: 2, category: "filling" }, // ignored — template owns fillings
      ],
      fillingTemplateLines: [{ item_id: 20, quantity: 3, category: "filling" }],
      preferenceLines: [
        { item_id: 30, quantity: 1, category: "cover" },
        { item_id: 31, quantity: 1, category: "case" },
      ],
      addonLines: [{ item_id: 40, quantity: 1 }],
      costByItem: new Map([
        [10, 5],
        [11, 4],
        [20, 2],
        [30, 8],
        [31, 6],
        [40, 10],
      ]),
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.lines.filter((l) => l.role === "composed").map((l) => l.item_id)).toEqual([
      10, 11,
    ]);
    expect(assembled.lines.filter((l) => l.role === "filling")).toEqual([
      { item_id: 20, quantity: 3, role: "filling", category: "filling" },
    ]);
    expect(assembled.lines.some((l) => l.item_id === 99)).toBe(false);
  });

  it("prices hold from length MSRP + prefs/add-ons + shipping + tax", () => {
    const priced = priceResult({
      composedSellableMsrp: 100,
      preferenceLines: [{ msrp: 20, quantity: 1 }],
      addonLines: [{ msrp: 10, quantity: 2 }],
      shipping: 8,
      tax: 12,
    });
    expect(priced.subtotal).toBe(140);
    expect(priced.total).toBe(160);
  });
});
