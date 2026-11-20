import { describe, it, expect } from "vitest";
import { assembleBuild } from "@/lib/build-assembly";

const PILLOW_BOM = [
  { item_id: 1, quantity: 2, category: "cover" },
  { item_id: 2, quantity: 1, category: "pillow_case" },
  { item_id: 3, quantity: 1, category: "pillow_protector" },
  { item_id: 4, quantity: 1, category: "packaging" },
];

function build(preferenceLines: Array<{ item_id: number; quantity: number; category: string }>) {
  const res = assembleBuild({
    composedBomLines: PILLOW_BOM,
    fillingTemplateLines: [],
    preferenceLines,
    addonLines: [],
    costByItem: new Map(),
  });
  if (!res.ok) throw new Error(res.error);
  return res;
}

const idsFor = (res: ReturnType<typeof build>, role: string) =>
  res.lines.filter((l) => l.role === role).map((l) => l.item_id);

describe("preference substitution", () => {
  it("displaces the BOM cover and case the shopper chose against", () => {
    const res = build([
      { item_id: 30, quantity: 1, category: "cover" },
      { item_id: 31, quantity: 1, category: "case" },
    ]);
    expect(idsFor(res, "composed")).toEqual([3, 4]);
    expect(idsFor(res, "preference")).toEqual([30, 31]);
  });

  it("ships exactly one of each role", () => {
    const res = build([
      { item_id: 30, quantity: 1, category: "cover" },
      { item_id: 31, quantity: 1, category: "case" },
    ]);
    const covers = res.lines.filter((l) => l.category === "cover");
    expect(covers).toHaveLength(1);
    expect(covers[0].item_id).toBe(30);
  });

  it("keeps a default the shopper did not choose against", () => {
    const res = build([{ item_id: 31, quantity: 1, category: "case" }]);
    expect(idsFor(res, "composed")).toEqual([1, 3, 4]);
  });

  it("leaves the BOM untouched when there are no preferences at all", () => {
    const res = build([]);
    expect(idsFor(res, "composed")).toEqual([1, 2, 3, 4]);
  });

  it("charges COGS for the chosen item, not the displaced default", () => {
    const res = assembleBuild({
      composedBomLines: [{ item_id: 2, quantity: 1, category: "pillow_case" }],
      fillingTemplateLines: [],
      preferenceLines: [{ item_id: 31, quantity: 1, category: "case" }],
      addonLines: [],
      costByItem: new Map([[2, 40], [31, 70]]),
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.cogs).toBe(70);
  });
});
