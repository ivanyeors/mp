import { describe, expect, it } from "vitest";
import {
  buildCostOptions,
  componentsCostCents,
  costRange,
  familyCaseItemId,
  marginPct,
  swapComponent,
} from "../build-costs";

// Premium XS as stored: two covers, an uncosted zip lock, a Fibrecool case, a protector.
const COVER = 1;
const ZIP_LOCK = 2;
const FIBRECOOL_CASE = 3;
const PROTECTOR = 4;
const DEEP_BLUE_LINEN = 5;
const NATURAL_WHITE_LINEN = 6;
const FILL_6D_S = 10;
const FILL_6D_L = 11;
const NECK = 20;

const costByItem = new Map<number, number | null>([
  [COVER, 370],
  [ZIP_LOCK, null],
  [FIBRECOOL_CASE, 1300],
  [PROTECTOR, 910],
  [DEEP_BLUE_LINEN, 965],
  [NATURAL_WHITE_LINEN, 965],
  [FILL_6D_S, 160],
  [FILL_6D_L, 230],
  [NECK, 300],
]);

const BOM = [
  { itemId: COVER, quantity: 2 },
  { itemId: ZIP_LOCK, quantity: 1 },
  { itemId: FIBRECOOL_CASE, quantity: 1 },
  { itemId: PROTECTOR, quantity: 1 },
];

describe("componentsCostCents", () => {
  it("counts an uncosted item as 0 and names it", () => {
    expect(componentsCostCents(BOM, costByItem)).toEqual({
      cents: 740 + 1300 + 910,
      uncostedItemIds: [ZIP_LOCK],
    });
  });
});

describe("familyCaseItemId", () => {
  const candidates = [
    { itemId: FIBRECOOL_CASE, family: "fibrecool", msrpCents: 8800 },
    { itemId: NATURAL_WHITE_LINEN, family: "linen", msrpCents: 6500 },
    { itemId: DEEP_BLUE_LINEN, family: "linen", msrpCents: 6500 },
    { itemId: 7, family: null, msrpCents: 1000 },
  ];
  const bomCase = { itemId: FIBRECOOL_CASE, family: "fibrecool", msrpCents: 8800 };

  it("keeps the BOM's case when it is already that family", () => {
    expect(familyCaseItemId({ bomCase, family: "fibrecool", candidates })).toBe(FIBRECOOL_CASE);
  });

  it("takes the family's cheapest priced case, ties by id", () => {
    expect(familyCaseItemId({ bomCase, family: "linen", candidates })).toBe(DEEP_BLUE_LINEN);
  });

  it("prefers a priced case over a cheaper unpriced one", () => {
    const withUnpriced = [...candidates, { itemId: 1, family: "linen", msrpCents: null }];
    expect(familyCaseItemId({ bomCase, family: "linen", candidates: withUnpriced })).toBe(DEEP_BLUE_LINEN);
  });

  it("returns null when the size has no case of that family", () => {
    expect(familyCaseItemId({ bomCase, family: "silk", candidates })).toBeNull();
  });
});

describe("swapComponent", () => {
  it("swaps at the same quantity", () => {
    const linen = swapComponent(BOM, FIBRECOOL_CASE, DEEP_BLUE_LINEN);
    expect(linen).toContainEqual({ itemId: DEEP_BLUE_LINEN, quantity: 1 });
    expect(linen.some((c) => c.itemId === FIBRECOOL_CASE)).toBe(false);
  });
});

describe("buildCostOptions", () => {
  const templates = [
    { id: 100, name: "Type-3", pack: [{ itemId: FILL_6D_S, count: 4 }, { itemId: FILL_6D_L, count: 2 }] },
    { id: 101, name: "Type-2", pack: [{ itemId: FILL_6D_S, count: 2 }, { itemId: NECK, count: 1 }] },
    { id: 102, name: "Type-5", pack: [{ itemId: FILL_6D_S, count: 3 }] },
  ];
  const neckSupportMsrpByItem = new Map<number, number | null>([[NECK, 3500]]);

  it("costs every template on top of the base, default first then cheapest", () => {
    const result = buildCostOptions({
      baseComponents: BOM,
      templates,
      defaultTemplateId: 100,
      costByItem,
      neckSupportMsrpByItem,
      allowNeckSupport: true,
    });
    expect(result.baseCents).toBe(2950);
    expect(result.options.map((o) => o.templateId)).toEqual([100, 102, 101]);
    const [def, cheap, neck] = result.options;
    expect(def).toMatchObject({ isDefault: true, pieces: 6, fillingCents: 1100, buildCents: 4050, extraChargeCents: 0 });
    expect(cheap).toMatchObject({ isDefault: false, fillingCents: 480, buildCents: 3430, neckSupport: "none" });
    // The neck support's cost is COGS; its MSRP is charged on top of the row.
    expect(neck).toMatchObject({ neckSupport: "charged", pieces: 3, fillingCents: 620, buildCents: 3570, extraChargeCents: 3500 });
    expect(neck.uncostedItemIds).toEqual([ZIP_LOCK]);
  });

  it("builds a Neck support template without it where the build takes none", () => {
    const result = buildCostOptions({
      baseComponents: BOM,
      templates,
      defaultTemplateId: 101,
      costByItem,
      neckSupportMsrpByItem,
      allowNeckSupport: false,
    });
    const neck = result.options.find((o) => o.templateId === 101)!;
    expect(neck).toMatchObject({
      isDefault: true,
      neckSupport: "left_out",
      lines: [{ itemId: FILL_6D_S, quantity: 2 }],
      pieces: 2,
      fillingCents: 320,
      buildCents: 3270,
      extraChargeCents: 0,
    });
  });

  it("reports an unpriced Neck support as an unknown charge, never 0", () => {
    const result = buildCostOptions({
      baseComponents: BOM,
      templates: [templates[1]],
      defaultTemplateId: null,
      costByItem,
      neckSupportMsrpByItem: new Map([[NECK, null]]),
      allowNeckSupport: true,
    });
    expect(result.options[0].extraChargeCents).toBeNull();
  });
});

describe("costRange and marginPct", () => {
  it("spans the costs, or is null with none", () => {
    expect(costRange([4050, 3430, 3570])).toEqual({ min: 3430, max: 4050 });
    expect(costRange([])).toBeNull();
  });

  it("is a share of the sell price, null without one", () => {
    expect(marginPct(34000, 4250)).toBeCloseTo(87.5);
    expect(marginPct(null, 4250)).toBeNull();
    expect(marginPct(0, 4250)).toBeNull();
  });
});
