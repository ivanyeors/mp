import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { CUSTOMER, EAR_PAD, PILLOW, STUDIO, seedStaffOrderDb, staffOrderAdmin } from "./harness";

type Row = Record<string, unknown>;

const BOLSTER = "0c0c0c0c-0000-4000-8000-000000000009";
const COVER = 1;
const CASE = 2;
const COVER_SILK = 3;
const CASE_COOL = 4;
const CASE_COTTON = 5;
const CASE_UNPRICED = 6;
const BOLSTER_CASE = 10;
const BOLSTER_CASE_GREY = 11;
const BOLSTER_CASE_LONG = 12;
const COOL_FAMILY_MORE = 40;
const FILL_S = 67;
const FILL_M = 68;
const EAR = 41;
const BOLSTER_COVER = 9;
const SIDE_SLEEPER = 501;
const SMALL_ONLY = 502;
const BOLSTER_MIX = 601;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Array<Record<string, unknown>>>,
  msrp: 460 as number | null,
  tier: "premium",
  keys: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", async () => {
  const { staffOrderAdmin: admin } = await import("./harness");
  return { supabaseAdmin: () => admin(h.db) };
});
vi.mock("@/lib/locations", () => ({
  getLocation: async (id: string) =>
    id === "studio-1"
      ? { id, name: "Mpillow Studio", type: "own", address: "200 Middle Road #01-02", postalCode: "188980" }
      : null,
  getLocations: async () => [],
}));
vi.mock("@/lib/ecommerce/discounts", () => ({ findActiveCoupon: async () => null, checkCoupon: vi.fn() }));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => null,
}));
vi.mock("@/lib/shipping/quote", () => ({ quoteShippingMethods: vi.fn(async () => ({ options: [] })) }));
vi.mock("@/lib/shipping/settings", () => ({ readShippingSettings: vi.fn() }));
vi.mock("@/lib/results/composed-sellable", () => ({
  loadComposedSellable: async (_admin: unknown, key: Record<string, unknown>) => {
    h.keys.push(key);
    if (h.msrp == null) return { ok: false, code: "no_price", error: "Composed sellable has no Costings MSRP" };
    const part = (id: number, extra: Record<string, unknown> = {}) => ({
      item_id: id,
      msrp: (h.db.item_prices.find((p) => p.item_id === id)?.msrp as number | undefined) ?? null,
      ...extra,
    });
    const inRecipe = (table: string, id: number) => h.db[table].some((l) => l.item_id === id);
    const sellable =
      key.productType === "pillow"
        ? {
            msrpByFamily: { "": h.msrp, fibrecool: h.msrp + COOL_FAMILY_MORE },
            defaultCover: inRecipe("bom_lines", COVER) ? part(COVER, { quantity: 1 }) : null,
            defaultCase: inRecipe("bom_lines", CASE) ? part(CASE, { family: null, quantity: 1 }) : null,
            coverOptions: [part(COVER), part(COVER_SILK)],
            caseOptions: [
              part(CASE, { family: null }),
              part(CASE_COOL, { family: "fibrecool" }),
              part(CASE_COTTON, { family: null }),
              part(CASE_UNPRICED, { family: null }),
            ],
          }
        : {
            msrpByFamily: { "": h.msrp },
            defaultCover: part(BOLSTER_COVER, { quantity: 1 }),
            defaultCase: inRecipe("bolster_bom_lines", BOLSTER_CASE) ? part(BOLSTER_CASE, { family: null, quantity: 1 }) : null,
            coverOptions: [],
            caseOptions: [],
          };
    return { ok: true, sellable: { msrp: h.msrp, priceFault: null, bomLines: [], currency: "SGD", ...sellable } };
  },
  getDefaultFillingTemplateId: async () => SIDE_SLEEPER,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          h.sessions.push(params);
          return { id: `cs_${h.sessions.length}`, status: "open", url: "https://checkout.stripe.com/c/pay/cs" };
        },
        retrieve: async (id: string) => ({ id, status: "expired", url: null }),
        expire: async () => undefined,
      },
    },
    coupons: { create: async () => ({ id: "co_1" }) },
  }),
}));

const { quoteStaffOrder } = await import("@/lib/staff-orders/quote");
const { createStaffOrder } = await import("@/lib/staff-orders/create");
const { loadBuildOptions, savedBuildsShortage } = await import("@/lib/staff-orders/builds");
const { openStaffOrderCheckout } = await import("@/lib/staff-orders/checkout");
const { isStaffBuildSnapshot } = await import("@/lib/staff-orders/build-snapshot");
const { deductInventoryForOrder, stockLinesForOrderItem } = await import("@/lib/ecommerce/inventory-deduction");
const { createMpConfigFromCustomization } = await import("@/lib/ecommerce/mp-config-sync");
const { snapshotPillowBuild } = await import("@/lib/customer-pillow/bought");

const NOW = new Date("2026-11-23T04:00:00Z");
const ACTOR = { userId: "user-1", email: "staff@mpillow.test" };
const admin = () => staffOrderAdmin(h.db as FakeDb) as never;

const cell = (section: string, sub: string, slot: number, itemId: number) => ({
  section,
  sub_section: sub,
  slot,
  item_id: itemId,
  row_index: slot - 1,
  insert_order: null,
  offset_x_mm: null,
  offset_y_mm: null,
});
const TEMPLATE_CELLS = [cell("left", "front", 1, FILL_S), cell("center", "middle", 1, FILL_M), cell("right", "front", 1, FILL_S)];

function seed(): FakeDb {
  const db = seedStaffOrderDb();
  const item = (id: number, category: string, name: string, size: string | null = null) => ({
    id,
    category,
    name,
    subtype: null,
    size,
    is_active: true,
  });
  db.items = [
    item(COVER, "cover", "Pillow cover M"),
    item(CASE, "pillow_case", "Linen case M"),
    item(FILL_S, "filling", "6D", "S"),
    item(FILL_M, "filling", "6D", "M"),
    item(EAR, "accessories", "Ear Comfort Pad"),
    item(BOLSTER_COVER, "cover", "Bolster cover"),
    item(COVER_SILK, "cover", "Silk cover", "M"),
    item(CASE_COOL, "pillow_case", "Fibrecool case", "M"),
    item(CASE_COTTON, "pillow_case", "Cotton case", "M"),
    item(CASE_UNPRICED, "pillow_case", "Sample case", "M"),
    item(BOLSTER_CASE, "bolster_case", "Camel bolster case", "M"),
    item(BOLSTER_CASE_GREY, "bolster_case", "Grey bolster case", "M"),
    item(BOLSTER_CASE_LONG, "bolster_case", "Camel bolster case", "L"),
  ];
  db.item_prices = [
    { item_id: COVER, cost_price: 12, msrp: 20 },
    { item_id: CASE, cost_price: 8, msrp: 25 },
    { item_id: COVER_SILK, cost_price: 18, msrp: 30 },
    { item_id: CASE_COOL, cost_price: 14, msrp: 45 },
    { item_id: CASE_COTTON, cost_price: 9, msrp: 35 },
    { item_id: CASE_UNPRICED, cost_price: 9 },
    { item_id: BOLSTER_CASE, cost_price: 6, msrp: 30 },
    { item_id: BOLSTER_CASE_GREY, cost_price: 7, msrp: 42 },
    { item_id: BOLSTER_CASE_LONG, cost_price: 7, msrp: 36 },
    { item_id: FILL_S, cost_price: 3 },
    { item_id: FILL_M, cost_price: 4 },
    { item_id: EAR, cost_price: 15, msrp: 39 },
    { item_id: BOLSTER_COVER, cost_price: 10 },
  ];
  db.inventory_balances = [
    { item_id: COVER, on_hand: 5 },
    { item_id: CASE, on_hand: 5 },
    { item_id: FILL_S, on_hand: 6 },
    { item_id: FILL_M, on_hand: 2 },
    { item_id: EAR, on_hand: 2 },
    { item_id: BOLSTER_COVER, on_hand: 3 },
    { item_id: COVER_SILK, on_hand: 4 },
    { item_id: CASE_COOL, on_hand: 1 },
    { item_id: CASE_COTTON, on_hand: 0 },
    { item_id: CASE_UNPRICED, on_hand: 4 },
    { item_id: BOLSTER_CASE, on_hand: 3 },
    { item_id: BOLSTER_CASE_GREY, on_hand: 2 },
    { item_id: BOLSTER_CASE_LONG, on_hand: 2 },
  ];
  db.pillow_products = [{ id: 3, size: "M", kind: h.tier, is_active: true, default_filling_template_id: SIDE_SLEEPER }];
  db.bom_lines = [
    { product_id: 3, item_id: COVER, quantity: 1 },
    { product_id: 3, item_id: CASE, quantity: 1 },
  ];
  const template = (id: number, kind: string, key: string, name: string) => ({ id, kind, key, role: "filling", is_active: true, name });
  db.bom_templates = [
    template(SIDE_SLEEPER, "pillow", "M", "Side sleeper"),
    template(SMALL_ONLY, "pillow", "S", "Small only"),
    template(BOLSTER_MIX, "bolster", "medium", "Medium bolster"),
  ];
  db.bom_template_keys = [
    { template_id: SIDE_SLEEPER, key: "M" },
    { template_id: SMALL_ONLY, key: "S" },
    { template_id: BOLSTER_MIX, key: "medium" },
  ];
  db.filling_template_placements = TEMPLATE_CELLS.map((c) => ({ template_id: SIDE_SLEEPER, ...c }));
  db.bolster_template_placements = [];
  db.bom_template_lines = [{ template_id: BOLSTER_MIX, item_id: FILL_S, quantity: 2 }];
  db.bolster_bom_lines = [
    { variant: "medium", item_id: BOLSTER_COVER, quantity: 1 },
    { variant: "medium", item_id: BOLSTER_CASE, quantity: 1 },
  ];
  db.bolster_length_config = [{ variant: "medium", default_filling_template_id: BOLSTER_MIX }];
  db.customization_configs = [];
  db.mp_config_responses = [];
  db.inventory_transactions = [];
  db.product_variants.find((v) => v.id === EAR_PAD)!.item_id = EAR;
  db.products.push({
    id: "p-bolster",
    slug: "mbolster",
    content: { "en-US": { title: "Mbolster" } },
    product_type: "bolster",
    status: "active",
    category_id: "cat-acc",
  });
  db.product_variants.push({
    id: BOLSTER,
    product_id: "p-bolster",
    sku: "SKU-BOLSTER-M",
    title: "Medium",
    price: 190,
    currency: "SGD",
    cost_price: null,
    image_url: null,
    weight_grams: 900,
    is_active: true,
    pillow_product_id: null,
    item_id: null,
    track_inventory: true,
    option1: "Medium",
  });
  return db;
}

const build = (extra: Row = {}) => ({
  variant_id: PILLOW,
  quantity: 1,
  filling_template_id: SIDE_SLEEPER,
  placements: TEMPLATE_CELLS,
  ...extra,
});

const draft = (extra: Row = {}) =>
  ({
    customer_id: CUSTOMER,
    goods: [],
    builds: [],
    services: [],
    delivery: { kind: "studio", location_id: STUDIO },
    ...extra,
  }) as Parameters<typeof quoteStaffOrder>[1];

const quote = (extra: Row) => quoteStaffOrder(admin(), draft(extra));
async function quoted(extra: Row) {
  const out = await quote(extra);
  if (!out.ok) throw new Error(out.error);
  return out.quote;
}
async function refusal(extra: Row) {
  const out = await quote(extra);
  if (out.ok) throw new Error("Expected the order to be refused");
  return out.error;
}

beforeEach(() => {
  h.msrp = 460;
  h.tier = "premium";
  h.keys = [];
  h.sessions = [];
  h.db = seed();
});

describe("a pillow or bolster on a Staff order", () => {
  it("charges the Costings price, not the Variant's or anything the browser sent", async () => {
    const q = await quoted({ builds: [{ ...build({ quantity: 2 }), unit_price: 1 }] });
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({
      kind: "goods",
      variantId: PILLOW,
      title: "Mpillow Premium",
      variantTitle: "Size M",
      unitPrice: 460,
      quantity: 2,
      build: { productType: "pillow", filling: "Side sleeper", adjusted: false, pieces: 3 },
    });
    expect(q).toMatchObject({ goodsSubtotal: 920, total: 920 });
    expect(h.keys).toEqual([{ productType: "pillow", size: "M", tier: "premium" }]);
  });

  it("refuses a build Costings has no price for", async () => {
    h.msrp = null;
    expect(await refusal({ builds: [build()] })).toBe(
      "Mpillow Premium · Size M has no price. Set it in Costings first. (Composed sellable has no Costings MSRP.)",
    );
  });

  it("keeps the template's name only while the fillings still match it", async () => {
    const adjusted = [...TEMPLATE_CELLS, cell("center", "back", 1, FILL_S)];
    const q = await quoted({ builds: [build({ placements: adjusted })] });
    expect(q.lines[0]).toMatchObject({ build: { filling: "Adjusted from Side sleeper", adjusted: true, pieces: 4 } });
    expect(q.builds[0].snapshot).toMatchObject({
      filling_template_id: null,
      filling_template_name: null,
      based_on_template: { id: SIDE_SLEEPER, name: "Side sleeper" },
    });
    expect(q.builds[0].snapshot.filling_lines).toEqual([
      { item_id: FILL_S, subtype: "", name: "6D S", quantity: 3 },
      { item_id: FILL_M, subtype: "", name: "6D M", quantity: 1 },
    ]);

    const custom = await quoted({ builds: [build({ filling_template_id: null })] });
    expect(custom.lines[0]).toMatchObject({ build: { filling: "Custom mix", adjusted: true } });
  });

  it("refuses a Filling Template that is not for this size", async () => {
    expect(await refusal({ builds: [build({ filling_template_id: SMALL_ONLY })] })).toMatch(/isn't one for this size/);
  });

  it("refuses anything in the pillow that is not a filling", async () => {
    const withCover = [...TEMPLATE_CELLS, cell("center", "back", 1, COVER)];
    expect(await refusal({ builds: [build({ placements: withCover })] })).toMatch(/may only use filling items/);
    const unknown = [cell("left", "front", 1, 9999)];
    expect(await refusal({ builds: [build({ placements: unknown })] })).toMatch(/Unknown item_id: 9999/);
    const noCell = [{ slot: 1, item_id: FILL_S }];
    expect(await refusal({ builds: [build({ placements: noCell })] })).toMatch(/needs a Section/);
  });

  it("lets an ear pad into a Premium pillow only, and charges each one on top of the pillow", async () => {
    const withEarPad = [...TEMPLATE_CELLS, cell("left", "middle", 1, EAR)];
    const q = await quoted({ builds: [build({ placements: withEarPad })] });
    expect(q.lines[0]).toMatchObject({ unitPrice: 499, build: { pieces: 4, placedExtras: 39 } });
    expect(q.builds[0].snapshot.total_addon_price).toBe(39);

    const two = [...withEarPad, cell("right", "middle", 1, EAR)];
    const twoPads = await quoted({ builds: [build({ placements: two })] });
    expect(twoPads).toMatchObject({ goodsSubtotal: 538, total: 538 });
    expect((await quoted({ builds: [build()] })).lines[0]).toMatchObject({ unitPrice: 460, build: { placedExtras: 0 } });

    h.db.item_prices.find((p) => p.item_id === EAR)!.msrp = null;
    expect(await refusal({ builds: [build({ placements: withEarPad })] })).toMatch(/Ear Comfort Pad placed in it has no price/);
    h.db.item_prices.find((p) => p.item_id === EAR)!.msrp = 39;

    h.tier = "basic";
    h.db = seed();
    expect(await refusal({ builds: [build({ placements: withEarPad })] })).toMatch(/premium pillows only/);
  });

  it("refuses a build the stock cannot make, counting every pillow in the order", async () => {
    expect(await refusal({ builds: [build({ quantity: 3 })] })).toBe(
      "Not enough stock to build Mpillow Premium · Size M: 6D M (need 3, have 2).",
    );
    const twoLines = await refusal({ builds: [build({ quantity: 2 }), build({ quantity: 1 })] });
    expect(twoLines).toMatch(/6D M \(need 1, have 0\)/);
    expect((await quote({ builds: [build({ quantity: 2 })] })).ok).toBe(true);
  });

  it("counts an accessory sold on the same order against what the build needs", async () => {
    const withEarPads = [...TEMPLATE_CELLS, cell("left", "middle", 1, EAR), cell("right", "middle", 1, EAR)];
    expect(await refusal({ goods: [{ variant_id: EAR_PAD, quantity: 1 }], builds: [build({ placements: withEarPads })] })).toMatch(
      /Ear Comfort Pad \(need 2, have 1\)/,
    );
    expect((await quote({ builds: [build({ placements: withEarPads })] })).ok).toBe(true);
  });

  it("counts the recipe's cover and case, not only the fillings", async () => {
    h.db.inventory_balances.find((b) => b.item_id === CASE)!.on_hand = 0;
    expect(await refusal({ builds: [build()] })).toMatch(/Linen case M \(need 1, have 0\)/);
  });

  it("charges the cover and case Staff chose from Costings: the case's family row, and the difference a dearer one makes", async () => {
    const standard = await quoted({ builds: [build({ cover_item_id: COVER, case_item_id: CASE })] });
    expect(standard.lines[0]).toMatchObject({ unitPrice: 460, build: { cover: "Pillow cover M", case: "Linen case M" } });

    const silk = await quoted({ builds: [build({ cover_item_id: COVER_SILK })] });
    expect(silk.lines[0]).toMatchObject({ unitPrice: 470, build: { cover: "Silk cover", case: "Linen case M" } });

    const cool = await quoted({ builds: [{ ...build({ case_item_id: CASE_COOL }), unit_price: 1 }] });
    expect(cool.lines[0]).toMatchObject({ unitPrice: 460 + COOL_FAMILY_MORE, build: { case: "Fibrecool case" } });

    const withEarPad = [...TEMPLATE_CELLS, cell("left", "middle", 1, EAR)];
    const both = await quoted({
      builds: [build({ quantity: 1, cover_item_id: COVER_SILK, case_item_id: CASE_COOL, placements: withEarPad })],
    });
    expect(both).toMatchObject({ goodsSubtotal: 549, total: 549 });
    expect(both.builds[0].snapshot.total_addon_price).toBe(39);
    expect(both.builds[0].snapshot.summary).toBe(
      "Fillings: Adjusted from Side sleeper · 4 pieces · Cover: Silk cover · Case: Fibrecool case",
    );
    expect(both.builds[0].snapshot.config_lines).toEqual([
      { item_id: COVER_SILK, category: "cover", name: "Silk cover", size: "M", quantity: 1, is_addon: false, price_delta: 30 },
      { item_id: CASE_COOL, category: "case", name: "Fibrecool case", size: "M", quantity: 1, is_addon: false, price_delta: 45 },
    ]);
    expect(both.builds[0].config).toMatchObject({ cover_variant: "Silk cover", case_variant: "Fibrecool case" });
  });

  it("refuses a cover or case that is not one for this size, and one Costings cannot price", async () => {
    expect(await refusal({ builds: [build({ cover_item_id: CASE_COOL })] })).toBe(
      "Mpillow Premium · Size M: that cover isn't one for this size. Pick another.",
    );
    expect(await refusal({ builds: [build({ case_item_id: COVER_SILK })] })).toMatch(/that case isn't one for this size/);
    expect(await refusal({ builds: [build({ case_item_id: BOLSTER_CASE })] })).toMatch(/that case isn't one for this size/);
    expect(await refusal({ builds: [build({ case_item_id: 9999 })] })).toMatch(/that case isn't one for this size/);
    expect(await refusal({ builds: [build({ case_item_id: CASE_UNPRICED })] })).toMatch(
      /has no price with that cover and case\. Set it in Costings first\. \(Selected case \(item 6\) has no Costings MSRP\.\)/,
    );
  });

  it("checks the stock of the cover and case chosen, in place of the recipe's", async () => {
    h.db.inventory_balances.find((b) => b.item_id === CASE)!.on_hand = 0;
    expect((await quote({ builds: [build({ case_item_id: CASE_COOL })] })).ok).toBe(true);
    expect(await refusal({ builds: [build({ quantity: 2, case_item_id: CASE_COOL })] })).toMatch(
      /Fibrecool case M \(need 2, have 1\)/,
    );
    expect(await refusal({ builds: [build({ case_item_id: CASE_COOL }), build({ case_item_id: CASE_COOL })] })).toMatch(
      /Fibrecool case M \(need 1, have 0\)/,
    );
    expect(await refusal({ builds: [build({ case_item_id: CASE_COTTON })] })).toMatch(/Cotton case M \(need 1, have 0\)/);
  });

  it("lets a bolster take a case made for its length, and never a cover", async () => {
    h.msrp = 190;
    const pieces = [
      { slot: 1, item_id: FILL_S },
      { slot: 2, item_id: FILL_S },
    ];
    const bolster = (extra: Row = {}) => build({ variant_id: BOLSTER, filling_template_id: BOLSTER_MIX, placements: pieces, ...extra });

    const standard = await quoted({ builds: [bolster()] });
    expect(standard.lines[0]).toMatchObject({ unitPrice: 190, build: { cover: null, case: "Camel bolster case" } });
    expect(standard.builds[0].snapshot.config_lines).toMatchObject([{ item_id: BOLSTER_CASE, category: "case", quantity: 1 }]);

    expect(await refusal({ builds: [bolster({ case_item_id: BOLSTER_CASE_GREY })] })).toMatch(
      /has no price with that cover and case\. Set it in Costings first/,
    );
    h.db.item_prices.find((p) => p.item_id === BOLSTER_COVER)!.msrp = 15;
    const grey = await quoted({ builds: [bolster({ case_item_id: BOLSTER_CASE_GREY })] });
    expect(grey.lines[0]).toMatchObject({ unitPrice: 202, build: { case: "Grey bolster case" } });

    expect(await refusal({ builds: [bolster({ case_item_id: BOLSTER_CASE_LONG })] })).toMatch(/that case isn't one for this length/);
    expect(await refusal({ builds: [bolster({ case_item_id: CASE })] })).toMatch(/that case isn't one for this length/);
    expect(await refusal({ builds: [bolster({ cover_item_id: BOLSTER_COVER })] })).toBe(
      "Mbolster · Medium: a bolster has no cover to choose.",
    );
  });

  it("still refuses a pillow added without its fillings, and a build of something that has none", async () => {
    expect(await refusal({ goods: [{ variant_id: PILLOW, quantity: 1 }] })).toMatch(/built to order/);
    expect(await refusal({ builds: [build({ variant_id: EAR_PAD })] })).toMatch(/has no fillings to choose/);
  });

  it("lays a bolster's flat recipe out as pieces and prices it from Costings", async () => {
    h.msrp = 190;
    const pieces = [
      { slot: 1, item_id: FILL_S },
      { slot: 2, item_id: FILL_S },
    ];
    const q = await quoted({ builds: [build({ variant_id: BOLSTER, filling_template_id: BOLSTER_MIX, placements: pieces })] });
    expect(q.lines[0]).toMatchObject({
      title: "Mbolster",
      unitPrice: 190,
      build: { productType: "bolster", filling: "Medium bolster", adjusted: false, pieces: 2 },
    });
    expect(q.builds[0].snapshot).toMatchObject({ product_type: "bolster", bolster_variant: "medium", pillow_product_id: null });
    expect(h.keys).toEqual([{ productType: "bolster", length: "medium" }]);
    expect(await refusal({ builds: [build({ variant_id: BOLSTER, placements: [{ slot: 1, item_id: EAR }] })] })).toMatch(
      /premium pillows only/,
    );
    expect(await refusal({ builds: [build({ variant_id: BOLSTER, placements: [{ slot: 1, item_id: COVER }] })] })).toMatch(
      /may only use filling items/,
    );
  });
});

describe("the order a build becomes", () => {
  async function made(extra: Row = {}) {
    const q = await quoted({ builds: [build(extra)], goods: [{ variant_id: EAR_PAD, quantity: 1 }] });
    const created = await createStaffOrder(admin(), q, ACTOR, NOW);
    if (!created.ok) throw new Error(created.error);
    const items = h.db.order_items.filter((i) => i.order_id === created.orderId);
    return { created, items, pillow: items.find((i) => i.variant_id === PILLOW)!, earPad: items.find((i) => i.variant_id === EAR_PAD)! };
  }

  it("is a goods line on the pillow's Variant that carries where every filling goes", async () => {
    const adjusted = [...TEMPLATE_CELLS, cell("center", "back", 1, FILL_S)];
    const { pillow, earPad, created } = await made({ placements: adjusted });
    expect(pillow).toMatchObject({ kind: "goods", variant_id: PILLOW, quantity: 1, unit_price: 460, total_price: 460 });
    expect(isStaffBuildSnapshot(pillow.customization_snapshot)).toBe(true);
    const snapshot = pillow.customization_snapshot as { filling_placements: unknown[]; pillow_product_id: number };
    expect(snapshot.filling_placements).toHaveLength(4);
    expect(snapshot.pillow_product_id).toBe(3);
    expect(snapshot).not.toHaveProperty("result_id");

    const config = h.db.customization_configs.find((c) => c.id === pillow.customization_id);
    expect(config).toMatchObject({ product_type: "pillow", pillow_product_id: 3, total_addon_price: 0 });
    expect(earPad.customization_id).toBeNull();
    expect(h.db.orders.find((o) => o.id === created.orderId)).toMatchObject({ status: "pending", total: 499 });
  });

  it("costs and deducts the recipe with the chosen fillings, not the default template's", async () => {
    const onlyTwo = [cell("left", "front", 1, FILL_M), cell("right", "front", 1, FILL_M)];
    const { pillow } = await made({ placements: onlyTwo });
    const variant = h.db.product_variants.find((v) => v.id === PILLOW) as never;
    const lines = await stockLinesForOrderItem(admin(), variant, pillow as never);
    expect([...(lines ?? [])].sort((a, b) => a.item_id - b.item_id)).toEqual([
      { item_id: COVER, quantity: 1 },
      { item_id: CASE, quantity: 1 },
      { item_id: FILL_M, quantity: 2 },
    ]);
    expect(pillow).toMatchObject({ unit_cost: 28, total_cost: 28 });
  });

  it("costs and deducts the cover and case Staff chose, not the recipe's, and re-checks them before payment", async () => {
    const { pillow, created, items } = await made({ quantity: 1, cover_item_id: COVER_SILK, case_item_id: CASE_COOL });
    expect(pillow).toMatchObject({ unit_price: 510, total_price: 510, unit_cost: 18 + 14 + 3 + 4 + 3 });
    const variant = h.db.product_variants.find((v) => v.id === PILLOW) as never;
    const lines = await stockLinesForOrderItem(admin(), variant, pillow as never);
    expect([...(lines ?? [])].sort((a, b) => a.item_id - b.item_id)).toEqual([
      { item_id: COVER_SILK, quantity: 1 },
      { item_id: CASE_COOL, quantity: 1 },
      { item_id: FILL_S, quantity: 2 },
      { item_id: FILL_M, quantity: 1 },
    ]);

    h.db.inventory_balances.find((b) => b.item_id === CASE)!.on_hand = 0;
    expect(await savedBuildsShortage(admin(), items as never)).toBeNull();
    h.db.inventory_balances.find((b) => b.item_id === CASE_COOL)!.on_hand = 0;
    expect(await savedBuildsShortage(admin(), items as never)).toBe(
      "Not enough stock to build Mpillow Premium · Size M: Fibrecool case M (need 1, have 0).",
    );
    h.db.inventory_balances.find((b) => b.item_id === CASE_COOL)!.on_hand = 1;

    await deductInventoryForOrder(created.orderId, [pillow] as never, admin());
    const taken = Object.fromEntries(h.db.inventory_transactions.map((t) => [Number(t.item_id), Number(t.quantity_signed)]));
    expect(taken).toEqual({ [COVER_SILK]: -1, [CASE_COOL]: -1, [FILL_S]: -2, [FILL_M]: -1 });
  });

  it("keeps each build on its own line when an order holds several, with a product and a service", async () => {
    const moreAtTheBack = [...TEMPLATE_CELLS, cell("center", "back", 1, FILL_S)];
    const q = await quoted({
      goods: [{ variant_id: EAR_PAD, quantity: 1 }],
      builds: [build({ placements: moreAtTheBack }), build({ quantity: 1 })],
      services: [{ key: "readjustment", quantity: 1 }],
    });
    const created = await createStaffOrder(admin(), q, ACTOR, NOW);
    if (!created.ok) throw new Error(created.error);
    const items = h.db.order_items.filter((i) => i.order_id === created.orderId);
    const summary = items.map((i) => {
      const snapshot = i.customization_snapshot as { filling_lines: Array<{ item_id: number; quantity: number }>; summary: string } | null;
      return [i.kind, i.variant_id ?? i.service_key, snapshot?.summary ?? null, snapshot?.filling_lines.find((l) => l.item_id === FILL_S)?.quantity ?? null];
    });
    expect(summary).toEqual([
      ["goods", EAR_PAD, null, null],
      ["goods", PILLOW, "Fillings: Adjusted from Side sleeper · 4 pieces · Cover: Pillow cover M · Case: Linen case M", 3],
      ["goods", PILLOW, "Fillings: Side sleeper · 3 pieces · Cover: Pillow cover M · Case: Linen case M", 2],
      ["service", "readjustment", null, null],
    ]);
    const configs = items.filter((i) => i.variant_id === PILLOW).map((i) => h.db.customization_configs.find((c) => c.id === i.customization_id));
    expect(configs.map((c) => (c?.filling_lines as Array<{ quantity: number }>)[0].quantity)).toEqual([3, 2]);
    expect(new Set(items.filter((i) => i.variant_id === PILLOW).map((i) => i.customization_id)).size).toBe(2);
  });

  it("takes out the recipe and the chosen fillings, for a pillow and for a bolster", async () => {
    h.msrp = 190;
    const q = await quoted({
      builds: [
        build({ quantity: 2 }),
        build({ variant_id: BOLSTER, filling_template_id: BOLSTER_MIX, placements: [{ slot: 1, item_id: FILL_S }, { slot: 2, item_id: FILL_S }] }),
      ],
    });
    const created = await createStaffOrder(admin(), q, ACTOR, NOW);
    if (!created.ok) throw new Error(created.error);
    const items = h.db.order_items.filter((i) => i.order_id === created.orderId);
    await deductInventoryForOrder(created.orderId, items as never, admin());
    const taken = new Map<number, number>();
    for (const row of h.db.inventory_transactions) {
      expect(row).toMatchObject({ reason: "sale", metadata: { order_id: created.orderId } });
      taken.set(Number(row.item_id), (taken.get(Number(row.item_id)) ?? 0) + Number(row.quantity_signed));
    }
    expect(Object.fromEntries(taken)).toEqual({
      [COVER]: -2,
      [CASE]: -2,
      [FILL_S]: -6,
      [FILL_M]: -2,
      [BOLSTER_COVER]: -1,
      [BOLSTER_CASE]: -1,
    });
  });

  it("is re-checked against stock before the customer pays", async () => {
    const { items } = await made();
    expect(await savedBuildsShortage(admin(), items as never)).toBeNull();
    h.db.inventory_balances.find((b) => b.item_id === FILL_M)!.on_hand = 0;
    expect(await savedBuildsShortage(admin(), items as never)).toBe(
      "Not enough stock to build Mpillow Premium · Size M: 6D M (need 1, have 0).",
    );
  });

  it("opens Checkout on the build's own stock, not the Variant's, and holds back what an accessory needs", async () => {
    const withEarPad = [...TEMPLATE_CELLS, cell("left", "middle", 1, EAR)];
    const { created } = await made({ placements: withEarPad });
    const token = String(h.db.order_payment_links.find((l) => l.order_id === created.orderId)!.token);
    const open = () => openStaffOrderCheckout(admin(), token, { origin: "https://custom.mpillow.com", now: NOW });

    h.db.variant_stock.find((v) => v.variant_id === PILLOW)!.stock_available = 0;
    expect(await open()).toMatchObject({ ok: true });
    expect(h.sessions[0]).toMatchObject({ metadata: { order_id: created.orderId, purpose: "staff_order" } });

    h.db.orders.find((o) => o.id === created.orderId)!.stripe_session_id = null;
    h.db.inventory_balances.find((b) => b.item_id === EAR)!.on_hand = 1;
    const refused = await open();
    expect(refused).toMatchObject({ ok: false, status: 409 });
    expect(!refused.ok && refused.error).toMatch(/Ear Comfort Pad \(need 1, have 0\)/);
    expect(h.sessions).toHaveLength(1);
  });

  it("writes no Results record when it is paid, and draws the customer's pillow from it", async () => {
    const { pillow, created } = await made();
    await createMpConfigFromCustomization(created.orderId, [pillow as never], null);
    expect(h.db.mp_config_responses).toHaveLength(0);
    expect(snapshotPillowBuild(pillow.customization_snapshot)).toMatchObject({
      resultId: null,
      templateId: SIDE_SLEEPER,
      templateName: "Side sleeper",
      placements: [{ section: "left" }, { section: "center" }, { section: "right" }],
    });
  });

  it("leaves no build behind when the order cannot be written", async () => {
    const q = await quoted({ builds: [build()] });
    const broken = staffOrderAdmin(h.db as FakeDb);
    const failing = {
      from(table: string) {
        const real = broken.from(table);
        if (table !== "order_items") return real;
        return { ...real, insert: () => Promise.resolve({ data: null, error: { message: "items refused" } }) };
      },
    };
    const out = await createStaffOrder(failing as never, q, ACTOR, NOW);
    expect(out).toMatchObject({ ok: false, error: "items refused" });
    expect(h.db.customization_configs).toHaveLength(0);
    expect(h.db.orders).toHaveLength(0);
  });
});

describe("what the fillings editor is offered", () => {
  const withOr = () => {
    const base = staffOrderAdmin(h.db as FakeDb);
    return {
      from(table: string) {
        const q = base.from(table) as unknown as Record<string, unknown>;
        q.or = () => q;
        return q;
      },
    } as never;
  };
  const EAR_TEMPLATE = 503;
  const FLAT_TEMPLATE = 504;

  beforeEach(() => {
    h.db.bom_templates.push(
      { id: EAR_TEMPLATE, kind: "pillow", key: "M", role: "filling", is_active: true, name: "With ear pads" },
      { id: FLAT_TEMPLATE, kind: "pillow", key: "M", role: "filling", is_active: true, name: "Legacy flat" },
    );
    h.db.bom_template_keys.push({ template_id: EAR_TEMPLATE, key: "M" }, { template_id: FLAT_TEMPLATE, key: "M" });
    h.db.filling_template_placements.push({ template_id: EAR_TEMPLATE, ...cell("left", "middle", 1, EAR) });
    h.db.bom_template_lines.push({ template_id: FLAT_TEMPLATE, item_id: FILL_S, quantity: 4 });
    h.db.filling_color_overrides = [];
    h.db.filling_dimension_overrides = [];
    h.db.neck_support_dimension_overrides = [];
    h.db.site_settings = [];
  });

  async function options(variantId: string) {
    const out = await loadBuildOptions(withOr(), variantId);
    if (!out.ok) throw new Error(out.error);
    return out.options;
  }

  it("offers a Premium pillow its size's laid-out templates, with the ear pad's price", async () => {
    const o = await options(PILLOW);
    expect(o).toMatchObject({ productType: "pillow", size: "M", tier: "premium", defaultTemplateId: SIDE_SLEEPER });
    expect(o.templates.map((t) => t.name)).toEqual(["Side sleeper", "With ear pads"]);
    expect(o.templates[0].placements).toHaveLength(3);
    expect(o.items.find((i) => i.id === EAR)).toMatchObject({ msrp: 39 });
    expect(o.items.find((i) => i.id === FILL_S)).not.toHaveProperty("msrp");
  });

  it("offers a Basic pillow and a bolster fillings only, and no template they could not take", async () => {
    h.tier = "basic";
    h.db.pillow_products[0].kind = "basic";
    const basic = await options(PILLOW);
    expect(basic.templates.map((t) => t.name)).toEqual(["Side sleeper"]);
    expect(new Set(basic.items.map((i) => i.category))).toEqual(new Set(["filling"]));

    const bolster = await options(BOLSTER);
    expect(bolster).toMatchObject({ productType: "bolster", length: "medium" });
    expect(bolster.templates).toEqual([
      { id: BOLSTER_MIX, name: "Medium bolster", placements: [{ slot: 1, item_id: FILL_S }, { slot: 2, item_id: FILL_S }] },
    ]);
    expect(new Set(bolster.items.map((i) => i.category))).toEqual(new Set(["filling"]));
  });

  it("offers a pillow its size's covers and cases, the recipe's first, each with what it adds and what is in stock", async () => {
    const o = await options(PILLOW);
    expect(o).toMatchObject({ defaultCoverId: COVER, defaultCaseId: CASE });
    expect(o.covers).toEqual([
      { itemId: COVER, name: "Pillow cover M", onHand: 5, priceDelta: 0 },
      { itemId: COVER_SILK, name: "Silk cover", onHand: 4, priceDelta: 10 },
    ]);
    expect(o.cases).toEqual([
      { itemId: CASE, name: "Linen case M", onHand: 5, priceDelta: 0 },
      { itemId: CASE_COTTON, name: "Cotton case", onHand: 0, priceDelta: 10 },
      { itemId: CASE_COOL, name: "Fibrecool case", onHand: 1, priceDelta: COOL_FAMILY_MORE },
      { itemId: CASE_UNPRICED, name: "Sample case", onHand: 4, priceDelta: null },
    ]);
  });

  it("offers a bolster the cases made for its length and no cover", async () => {
    h.msrp = 190;
    h.db.item_prices.find((p) => p.item_id === BOLSTER_COVER)!.msrp = 15;
    const o = await options(BOLSTER);
    expect(o).toMatchObject({ covers: [], defaultCoverId: null, defaultCaseId: BOLSTER_CASE });
    expect(o.cases).toEqual([
      { itemId: BOLSTER_CASE, name: "Camel bolster case", onHand: 3, priceDelta: 0 },
      { itemId: BOLSTER_CASE_GREY, name: "Grey bolster case", onHand: 2, priceDelta: 12 },
    ]);
  });

  it("offers no cover or case when Costings has no price for the build", async () => {
    h.msrp = null;
    expect(await options(PILLOW)).toMatchObject({ covers: [], cases: [], defaultCoverId: null, defaultCaseId: null });
  });

  it("refuses a product that has no fillings, and one no longer for sale", async () => {
    expect(await loadBuildOptions(withOr(), EAR_PAD)).toMatchObject({ ok: false, status: 400 });
    h.db.product_variants.find((v) => v.id === PILLOW)!.is_active = false;
    expect(await loadBuildOptions(withOr(), PILLOW)).toMatchObject({ ok: false, status: 404 });
  });
});
