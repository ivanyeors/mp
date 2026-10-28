import { describe, expect, it } from "vitest";
import {
  planMirrorBuildRecost,
  resolveShopifyMappingUnitCost,
  shopifyMappingBuildLines,
  shopifyMappingUncostedItemIds,
  type CostingsContext,
  type MirrorLineRow,
  type ShopifyVariantMapping,
} from "../order-mirror-ingest";

// Premium M: recipe = case 8 + protector 13 + 2 covers 3 + packaging 23.
// Default Filling Template 53 = 6 pieces of 67 and 2 of 57.
const ctx: CostingsContext = {
  mappingsByVariantId: new Map(),
  pillowProductIdByKindSize: new Map([["premium:M", 8]]),
  bomByPillowProductId: new Map([
    [
      8,
      [
        { item_id: 8, quantity: 1 },
        { item_id: 13, quantity: 1 },
        { item_id: 3, quantity: 2 },
        { item_id: 23, quantity: 1 },
      ],
    ],
  ]),
  bomByBolsterVariant: new Map([["medium", [{ item_id: 64, quantity: 1 }]]]),
  costByItemId: new Map([
    [8, 11.1],
    [13, 10.25],
    [3, 4.3],
    [23, 0.7],
    [67, 1.6],
    [57, 2.9],
    [64, 10],
  ]),
  templateLinesById: new Map([
    [
      53,
      [
        { item_id: 67, quantity: 6 },
        { item_id: 57, quantity: 2 },
      ],
    ],
    // A Shopify-era warehouse template: the whole build, fillings included.
    [
      11,
      [
        { item_id: 8, quantity: 1 },
        { item_id: 13, quantity: 1 },
        { item_id: 3, quantity: 2 },
        { item_id: 67, quantity: 10 },
      ],
    ],
    [7, [{ item_id: 75, quantity: 1 }, { item_id: 67, quantity: 4 }]],
  ]),
  defaultFillingTemplateByPillowProductId: new Map([[8, 53]]),
  defaultFillingTemplateByBolsterVariant: new Map(),
};

const pillow = (over: Partial<ShopifyVariantMapping> = {}): ShopifyVariantMapping => ({
  shopify_variant_id: 1,
  kind: "pillow",
  pillow_size: "M",
  pillow_kind: "premium",
  bolster_variant: null,
  item_id: null,
  default_template_id: null,
  ...over,
});

describe("Shopify mirror build cost", () => {
  it("costs a pillow's fillings, not its recipe alone", () => {
    // recipe 11.1 + 10.25 + 8.6 + 0.7 = 30.65; fillings 9.6 + 5.8 = 15.4
    expect(resolveShopifyMappingUnitCost(pillow(), ctx)).toBeCloseTo(46.05, 2);
  });

  it("costs the warehouse template the Shopify queue deducted, when the variant has one", () => {
    expect(shopifyMappingBuildLines(pillow({ default_template_id: 11 }), ctx)).toEqual(ctx.templateLinesById!.get(11));
    // 11.1 + 10.25 + 8.6 + 16
    expect(resolveShopifyMappingUnitCost(pillow({ default_template_id: 11 }), ctx)).toBeCloseTo(45.95, 2);
  });

  it("falls back to the Composed sellable's build when the warehouse template is gone", () => {
    expect(resolveShopifyMappingUnitCost(pillow({ default_template_id: 999 }), ctx)).toBeCloseTo(46.05, 2);
  });

  it("leaves a build with an uncosted Item uncosted, and names the Item", () => {
    const m = pillow({ default_template_id: 7 });
    expect(resolveShopifyMappingUnitCost(m, ctx)).toBeNull();
    expect(shopifyMappingUncostedItemIds(m, ctx)).toEqual([75]);
  });

  it("costs a part as its Item and a bolster as its length's build", () => {
    expect(resolveShopifyMappingUnitCost(pillow({ kind: "part", item_id: 64 }), ctx)).toBe(10);
    expect(
      resolveShopifyMappingUnitCost(pillow({ kind: "bolster", pillow_size: null, bolster_variant: "medium" }), ctx),
    ).toBe(10);
  });

  it("has no build for a pillow size with no product", () => {
    expect(shopifyMappingBuildLines(pillow({ pillow_size: "XXL" }), ctx)).toBeNull();
    expect(resolveShopifyMappingUnitCost(pillow({ pillow_size: "XXL" }), ctx)).toBeNull();
  });
});

describe("planMirrorBuildRecost", () => {
  const recostCtx: CostingsContext = {
    ...ctx,
    mappingsByVariantId: new Map([
      [1, pillow({ shopify_variant_id: 1, default_template_id: 11 })],
      [2, pillow({ shopify_variant_id: 2, kind: "part", pillow_size: null, item_id: 64 })],
      [3, pillow({ shopify_variant_id: 3, default_template_id: 7 })],
    ]),
  };
  const line = (over: Partial<MirrorLineRow>): MirrorLineRow => ({
    shopify_line_item_id: 1,
    shopify_order_id: 9,
    shopify_variant_id: 1,
    sku: null,
    title: "Premium Mpillow",
    quantity: 2,
    gross_revenue: 800,
    unit_cost: 30.65,
    total_cost: 61.3,
    mapping_kind: "pillow",
    is_others: false,
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  });
  const at = "2026-10-28T00:00:00Z";

  it("re-costs a recipe-only pillow line from its whole build", () => {
    const [p] = planMirrorBuildRecost([line({})], recostCtx, at);
    expect(p).toMatchObject({ unit_cost: 45.95, total_cost: 91.9, is_others: false, updated_at: at });
  });

  it("keeps a restocked unit out of COGS", () => {
    // One of two restocked: 30.65 × 2 − 30.65.
    const [p] = planMirrorBuildRecost([line({ total_cost: 30.65 })], recostCtx, at);
    expect(p.total_cost).toBe(45.95);
  });

  it("graduates an Others line whose build now costs, and leaves parts and uncostable builds alone", () => {
    const patches = planMirrorBuildRecost(
      [
        line({ shopify_line_item_id: 2, is_others: true, unit_cost: null, total_cost: null }),
        line({ shopify_line_item_id: 3, shopify_variant_id: 2, mapping_kind: "part", unit_cost: 10, total_cost: 20 }),
        line({ shopify_line_item_id: 4, shopify_variant_id: 3 }),
      ],
      recostCtx,
      at,
    );
    expect(patches.map((p) => p.shopify_line_item_id)).toEqual([2]);
    expect(patches[0]).toMatchObject({ total_cost: 91.9, is_others: false });
  });

  it("finds nothing to do the second time", () => {
    const once = planMirrorBuildRecost([line({})], recostCtx, at);
    expect(planMirrorBuildRecost(once, recostCtx, at)).toEqual([]);
  });
});
