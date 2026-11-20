import { describe, it, expect } from "vitest";
import { assembleBuild, findStockShortages } from "@/lib/build-assembly";

const costs = new Map<number, number>([
  [1, 2],
  [2, 5],
  [3, 1],
  [4, 3],
  [5, 4],
  [6, 6],
  [7, 10],
  [8, 7],
]);

describe("assembleBuild", () => {
  it("takes non-filling lines including protector from composed sellable only", () => {
    const result = assembleBuild({
      composedBomLines: [
        { item_id: 1, quantity: 1, category: "packaging" },
        { item_id: 2, quantity: 1, category: "protector" },
        { item_id: 3, quantity: 2, category: "filling" },
      ],
      fillingTemplateLines: [{ item_id: 4, quantity: 3, category: "filling" }],
      preferenceLines: [],
      addonLines: [],
      costByItem: costs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      { item_id: 1, quantity: 1, role: "composed", category: "packaging" },
      { item_id: 2, quantity: 1, role: "composed", category: "protector" },
      { item_id: 4, quantity: 3, role: "filling", category: "filling" },
    ]);
    expect(result.cogs).toBe(2 + 5 + 9);
  });

  it("takes filling lines only from the Filling Template", () => {
    const result = assembleBuild({
      composedBomLines: [{ item_id: 3, quantity: 99, category: "filling" }],
      fillingTemplateLines: [{ item_id: 4, quantity: 1, category: "filling" }],
      preferenceLines: [],
      addonLines: [],
      costByItem: costs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.filter((l) => l.role === "filling")).toEqual([
      { item_id: 4, quantity: 1, role: "filling", category: "filling" },
    ]);
    expect(result.lines.some((l) => l.item_id === 3)).toBe(false);
  });

  it("accepts cover/case preferences and includes add-ons", () => {
    const result = assembleBuild({
      composedBomLines: [{ item_id: 1, quantity: 1, category: "packaging" }],
      fillingTemplateLines: [{ item_id: 4, quantity: 1, category: "filling" }],
      preferenceLines: [
        { item_id: 5, quantity: 1, category: "cover" },
        { item_id: 6, quantity: 1, category: "case" },
      ],
      addonLines: [{ item_id: 7, quantity: 2 }],
      costByItem: costs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => l.role)).toEqual([
      "composed",
      "filling",
      "preference",
      "preference",
      "addon",
    ]);
    expect(result.cogs).toBe(2 + 3 + 4 + 6 + 20);
  });

  it("rejects protector as a preference", () => {
    const result = assembleBuild({
      composedBomLines: [],
      fillingTemplateLines: [],
      preferenceLines: [{ item_id: 8, quantity: 1, category: "protector" }],
      addonLines: [],
      costByItem: costs,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("8");
    expect(result.error).toMatch(/cover and case/i);
  });

  it("rejects invalid filling templates with non-filling lines", () => {
    const result = assembleBuild({
      composedBomLines: [],
      fillingTemplateLines: [
        { item_id: 4, quantity: 1, category: "filling" },
        { item_id: 2, quantity: 1, category: "protector" },
      ],
      preferenceLines: [],
      addonLines: [],
      costByItem: costs,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("2");
  });

  it("ships a neck support placed in the pillow beside the fillings", () => {
    const result = assembleBuild({
      composedBomLines: [],
      fillingTemplateLines: [
        { item_id: 4, quantity: 2, category: "filling" },
        { item_id: 61, quantity: 1, category: "neck_support" },
      ],
      preferenceLines: [],
      addonLines: [],
      costByItem: new Map([...costs, [61, 9]]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.filter((l) => l.role === "filling").map((l) => l.item_id)).toEqual([4, 61]);
    expect(result.cogs).toBe(2 * (costs.get(4) ?? 0) + 9);

    const raw = assembleBuild({
      composedBomLines: [],
      fillingTemplateLines: [{ item_id: 61, quantity: 1, category: "accessories" }],
      preferenceLines: [],
      addonLines: [],
      costByItem: costs,
    });
    expect(raw.ok).toBe(false);
  });
});

describe("findStockShortages", () => {
  it("returns empty when all lines are covered", () => {
    expect(
      findStockShortages(
        [
          { item_id: 1, quantity: 2, role: "composed" },
          { item_id: 1, quantity: 1, role: "filling" },
        ],
        new Map([[1, 3]]),
      ),
    ).toEqual([]);
  });

  it("reports shortages with names", () => {
    const shortages = findStockShortages(
      [{ item_id: 4, quantity: 5, role: "filling" }],
      new Map([[4, 2]]),
      new Map([[4, "Soft fill"]]),
    );
    expect(shortages).toEqual([
      { item_id: 4, name: "Soft fill", needed: 5, available: 2 },
    ]);
  });
});
