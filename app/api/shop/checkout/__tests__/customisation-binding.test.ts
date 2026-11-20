import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  inserts: [] as Array<{ table: string; row: unknown }>,
  sessionsCreate: vi.fn(),
  loadComposedSellable: vi.fn(),
  quoteShippingMethods: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const filter = (col: string, ok: (v: unknown) => boolean) => {
        filters.push((row) => !(col in row) || ok(row[col]));
        return b;
      };
      const result = () => {
        const data = h.tables[table] ?? null;
        return {
          data: Array.isArray(data) ? data.filter((r) => filters.every((f) => f(r))) : data,
          error: null,
        };
      };
      const one = () => {
        const { data } = result();
        return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null });
      };
      const b: Record<string, unknown> = {
        select: () => b,
        in: (col: string, vals: unknown[]) => filter(col, (v) => vals.map(String).includes(String(v))),
        eq: (col: string, val: unknown) => filter(col, (v) => String(v) === String(val)),
        ilike: () => b,
        or: () => b,
        order: () => b,
        update: () => b,
        delete: () => b,
        single: one,
        maybeSingle: one,
        insert: (row: unknown) => {
          h.inserts.push({ table, row });
          return b;
        },
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/results/composed-sellable", () => ({ loadComposedSellable: h.loadComposedSellable }));
vi.mock("@/lib/shop/customization-llm", () => ({
  getFillingRecommendation: async () => ({
    recommended_size: "XS",
    recommended_kind: (h.tables.pillow_products as { kind: string }).kind,
    filling_lines: [{ item_id: 5, subtype: "3D-S", name: "3D Fibre", quantity: 1 }],
    summary: "",
    explanation: "",
  }),
  getBolsterRecommendation: async () => ({ recommended_size: "L", recommendation_record: { size: "long" } }),
  getBomTemplates: async () => [],
  getAvailableFillings: async () => [],
  getRecommendationFromMeasurements: vi.fn(),
  getSizeBallparkFromMeasurements: vi.fn(),
  getSizeBallparkFromPreferences: vi.fn(),
}));
vi.mock("@/lib/ecommerce/customers", () => ({
  findOrCreateCustomer: async () => ({ id: "cust-1" }),
  findCustomerByEmail: async () => null,
}));
vi.mock("@/lib/ecommerce/discounts", () => ({ checkCoupon: vi.fn(), findActiveCoupon: vi.fn() }));
vi.mock("@/lib/referrals", () => ({ getPartnerByReferralCode: async () => null, isSelfReferral: async () => false }));
vi.mock("@/lib/auth/partner", () => ({ getPartnerContext: async () => null, isPartnerActive: () => false }));
vi.mock("@/lib/partner-self-purchase/allowance", () => ({ loadSelfPurchaseAllowance: vi.fn() }));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => null,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } } }),
}));
vi.mock("@/lib/shipping/quote", () => ({ quoteShippingMethods: h.quoteShippingMethods }));
vi.mock("@/lib/shipping/settings", () => ({ readShippingSettings: async () => ({}) }));

const { POST: checkout } = await import("@/app/api/shop/checkout/route");
const { POST: customize } = await import("@/app/api/shop/customize/route");
const { computeAddonPrice, computeComponentLines, computeFillingLines } = await import(
  "@/components/shop/customization-steps"
);
const { buildCustomizeApplyPayload } = await import("@/lib/shop/customize-apply-payload");
type RecommendationResponseData = import("@/components/shop/customization-steps").RecommendationResponseData;

const PILLOW_PRODUCT = "11111111-1111-4111-8111-111111111111";
const ACCESSORY_PRODUCT = "22222222-2222-4222-8222-222222222222";
const BOLSTER_PRODUCT = "33333333-3333-4333-8333-333333333333";
const PILLOW_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER_PILLOW_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ACCESSORY_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const BOLSTER_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const BOLSTER_SHORT_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const CONFIG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHIPPING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const variant = (id: string, over: Record<string, unknown>) => ({
  id,
  title: id,
  sku: id,
  option1: null,
  price: 170,
  currency: "SGD",
  cost_price: null,
  is_active: true,
  stripe_price_id: `price_${id}`,
  stripe_price_id_test: `price_${id}`,
  pillow_product_id: null,
  item_id: null,
  image_url: null,
  ...over,
});

const variants = [
  variant(PILLOW_VARIANT, {
    product_id: PILLOW_PRODUCT,
    pillow_product_id: 7,
    products: { id: PILLOW_PRODUCT, slug: "mpillow", product_type: "pillow", content: {} },
  }),
  variant(OTHER_PILLOW_VARIANT, {
    product_id: PILLOW_PRODUCT,
    pillow_product_id: 8,
    products: { id: PILLOW_PRODUCT, slug: "mpillow", product_type: "pillow", content: {} },
  }),
  variant(ACCESSORY_VARIANT, {
    product_id: ACCESSORY_PRODUCT,
    price: 12,
    item_id: 99,
    products: { id: ACCESSORY_PRODUCT, slug: "spray", product_type: "accessory", content: {} },
  }),
  variant(BOLSTER_VARIANT, {
    product_id: BOLSTER_PRODUCT,
    title: "Long",
    sku: "MBOLSTER-LONG",
    option1: "long",
    price: 230,
    products: { id: BOLSTER_PRODUCT, slug: "mbolster", product_type: "bolster", content: {} },
  }),
  variant(BOLSTER_SHORT_VARIANT, {
    product_id: BOLSTER_PRODUCT,
    title: "Short",
    sku: "MBOLSTER-SHORT",
    option1: "Short",
    price: 200,
    products: { id: BOLSTER_PRODUCT, slug: "mbolster", product_type: "bolster", content: {} },
  }),
];

const item = (id: number, category: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  category,
  name,
  subtype: null,
  size: "XS",
  is_active: true,
  ...over,
});

const items = [
  item(1, "cover", "Satin Cover"),
  item(42, "pillow_case", "Linen Case"),
  item(32, "pillow_case", "Fibrecool Case"),
  item(7, "cover", "Clearance Cover", { size: "XL" }),
  item(8, "accessory", "Linen Spray", { size: null }),
  item(21, "packaging", "Gift Box", { size: "S" }),
  item(23, "packaging", "Dust Bag", { size: "S" }),
  item(64, "bolster_case", "Camel Case", { size: "S" }),
  item(86, "bolster_case", "Camel Case", { size: "L" }),
  item(5, "filling", "3D Fibre", { subtype: "3D-S" }),
  item(6, "filling", "6D Fibre (retired)", { subtype: "6D-L", is_active: false }),
];

const packagingBom = [
  { item_id: 21, quantity: 1, category: "packaging" },
  { item_id: 23, quantity: 1, category: "packaging" },
];

const basicXs = {
  bomLines: [
    { item_id: 1, quantity: 1, category: "cover" },
    { item_id: 42, quantity: 1, category: "pillow_case" },
    ...packagingBom,
  ],
  msrp: 170,
  priceFault: null,
  msrpByFamily: { "": 170 } as Record<string, number>,
  defaultCover: { item_id: 1, msrp: 25, quantity: 1 },
  defaultCase: { item_id: 42, msrp: 65, family: "linen", quantity: 1 },
  caseOptions: [
    { item_id: 42, msrp: 65, family: "linen" },
    { item_id: 32, msrp: 88, family: "fibrecool" },
  ],
  coverOptions: [{ item_id: 1, msrp: 25 }],
  currency: "SGD",
};

const premiumXs = {
  ...basicXs,
  bomLines: [
    { item_id: 1, quantity: 2, category: "cover" },
    { item_id: 32, quantity: 1, category: "pillow_case" },
    ...packagingBom,
  ],
  msrp: 360,
  msrpByFamily: { linen: 340, fibrecool: 360 },
  defaultCover: { item_id: 1, msrp: 25, quantity: 2 },
  defaultCase: { item_id: 32, msrp: 88, family: "fibrecool", quantity: 1 },
};

const bolster = (length: string) => {
  const [caseId, caseMsrp, msrp] = length === "short" ? [64, 25, 200] : [86, 37, 230];
  return {
    bomLines: [{ item_id: caseId, quantity: 1, category: "bolster_case" }],
    msrp,
    priceFault: null,
    msrpByFamily: { "": msrp },
    defaultCover: null,
    defaultCase: { item_id: caseId, msrp: caseMsrp, quantity: 1 },
    caseOptions: [],
    coverOptions: [],
    currency: "SGD",
  };
};

const caseLine = (item_id: number) => ({
  item_id,
  category: "case",
  name: "Camel Case",
  quantity: 1,
  is_addon: false,
  price_delta: 0,
});

const bomRows = (product_id: number, lines: Array<{ item_id: number; quantity: number }>) =>
  lines.map((l) => ({ product_id, item_id: l.item_id, quantity: l.quantity }));

let pillowSellable: typeof basicXs = basicXs;

const fibrecoolLines = [
  { item_id: 1, category: "cover", name: "Satin", quantity: 1, is_addon: false, price_delta: 0 },
  { item_id: 32, category: "case", name: "Fibrecool", quantity: 1, is_addon: false, price_delta: 0 },
];
const COMPOSED = 193;

const bolsterConfig = (length: string, over: Record<string, unknown> = {}) =>
  pillowConfig({
    product_type: "bolster",
    pillow_product_id: null,
    ecom_product_id: BOLSTER_PRODUCT,
    bolster_variant: length,
    config_lines: [caseLine(length === "short" ? 64 : 86)],
    ...over,
  });

function pillowConfig(over: Record<string, unknown> = {}) {
  return {
  id: CONFIG,
  product_type: "pillow",
  pillow_product_id: 7,
  ecom_product_id: null,
  bolster_variant: null,
  config_lines: fibrecoolLines,
  filling_lines: [],
  total_addon_price: COMPOSED - 170,
  summary: "Case: Fibrecool",
  ...over,
  };
}

const post = (items: Array<Record<string, unknown>>) =>
  checkout(
    new Request("https://x.test/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ada@x.test",
        shipping_address: { recipient: "Ada", line1: "1 Road", city: "SG", postal_code: "123456" },
        shipping_method_id: SHIPPING,
        items,
      }),
    }),
  );

const ordersInserted = () => h.inserts.filter((i) => i.table === "orders");
const stripeLines = () => h.sessionsCreate.mock.calls[0][0].line_items;

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts.length = 0;
  h.tables = {
    product_variants: variants,
    variant_stock: [{ variant_id: ACCESSORY_VARIANT, stock_available: 5 }],
    customization_configs: [pillowConfig()],
    pillow_products: { id: 7, size: "XS", kind: "basic" },
    products: [{ id: BOLSTER_PRODUCT, slug: "mbolster", product_type: "bolster", status: "active" }],
    items,
    inventory_balances: items.map((i) => ({ item_id: i.id, on_hand: 100 })),
    item_prices: [
      { item_id: 1, msrp: 25, cost_price: 5 },
      { item_id: 42, msrp: 65, cost_price: 15 },
      { item_id: 32, msrp: 88, cost_price: 20 },
      { item_id: 7, msrp: 1, cost_price: 1 },
      { item_id: 8, msrp: 1, cost_price: 1 },
      { item_id: 21, msrp: 5, cost_price: 1 },
      { item_id: 23, msrp: 5, cost_price: 1 },
      { item_id: 64, msrp: 25, cost_price: 5 },
      { item_id: 86, msrp: 37, cost_price: 8 },
    ],
    bom_lines: bomRows(7, basicXs.bomLines),
    bolster_bom_lines: [
      { variant: "short", item_id: 64, quantity: 1 },
      { variant: "long", item_id: 86, quantity: 1 },
    ],
    customers: null,
    shipping_methods: { id: SHIPPING, slug: "std", base_rate: 0, free_above: null, content: {} },
    orders: { id: "order-1", order_number: "MP-1" },
  };
  pillowSellable = basicXs;
  h.loadComposedSellable.mockImplementation(async (_admin: unknown, key: { productType: string; length?: string }) => ({
    ok: true,
    sellable: key.productType === "bolster" ? bolster(key.length!) : pillowSellable,
  }));
  h.sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://stripe.test/cs_1" });
});

describe("POST /api/shop/checkout — a customised line is bound to its build", () => {
  it("refuses a pillow customisation posted with an accessory variant, before any write", async () => {
    const res = await post([{ variant_id: ACCESSORY_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(ordersInserted()).toHaveLength(0);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a pillow customisation posted with a different pillow product's variant", async () => {
    const res = await post([{ variant_id: OTHER_PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(ordersInserted()).toHaveLength(0);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("charges the recomputed composed price even when the stored snapshot was tampered with", async () => {
    h.tables.customization_configs = [pillowConfig({ total_addon_price: -158 })];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 2, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(stripeLines()).toEqual([
      expect.objectContaining({
        quantity: 2,
        price_data: expect.objectContaining({ unit_amount: COMPOSED * 100 }),
      }),
    ]);
    const order = ordersInserted()[0].row as { subtotal: number };
    expect(order.subtotal).toBe(COMPOSED * 2);
    const [orderItem] = h.inserts.find((i) => i.table === "order_items")!.row as Array<{
      unit_price: number;
      customization_snapshot: { total_addon_price: number };
    }>;
    expect(orderItem.unit_price).toBe(COMPOSED);
    expect(orderItem.customization_snapshot.total_addon_price).toBe(COMPOSED - 170);
  });

  it("uses the catalog Price only when the recomputed build costs the shelf price", async () => {
    h.tables.customization_configs = [
      pillowConfig({
        config_lines: [
          { item_id: 1, category: "cover", name: "Satin", quantity: 1, is_addon: false, price_delta: 0 },
          { item_id: 42, category: "case", name: "Linen", quantity: 1, is_addon: false, price_delta: 0 },
        ],
        total_addon_price: 23,
      }),
    ];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(stripeLines()).toEqual([{ price: `price_${PILLOW_VARIANT}`, quantity: 1 }]);
  });

  it("binds a bolster customisation to its product and prices its length from Costings", async () => {
    h.tables.customization_configs = [bolsterConfig("long")];
    h.tables.product_variants = variants.map((v) => (v.id === BOLSTER_VARIANT ? { ...v, price: 90 } : v));
    const res = await post([{ variant_id: BOLSTER_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(h.loadComposedSellable).toHaveBeenCalledWith(expect.anything(), {
      productType: "bolster",
      length: "long",
    });
    expect(stripeLines()[0].price_data.unit_amount).toBe(23000);
  });

  it("refuses a bolster customisation posted with a variant of another product", async () => {
    h.tables.customization_configs = [bolsterConfig("long")];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/shop/checkout — live Easyship shipping", () => {
  const liveMethod = {
    id: SHIPPING,
    slug: "standard",
    base_rate: 8,
    free_above: null,
    content: { "en-US": { name: "Standard" } },
    currency: "SGD",
    countries: ["SG"],
    rate_source: "easyship",
    easyship_strategy: "cheapest",
  };
  const option = {
    method: liveMethod,
    amount: 7.5,
    is_free: false,
    currency: "SGD",
    source: "easyship",
    courier: { service_id: "cs_ninja", name: "Ninja Van Standard", umbrella_name: "Ninja Van" },
    carrier_cost: 6.42,
    min_days: 2,
    max_days: 4,
  };

  it("charges the re-priced live rate and records the courier on the order", async () => {
    h.tables.shipping_methods = liveMethod;
    h.quoteShippingMethods.mockResolvedValue({ options: [option], rates: null });
    const res = await post([{ variant_id: ACCESSORY_VARIANT, quantity: 2 }]);
    expect(res.status).toBe(200);

    const [, input] = h.quoteShippingMethods.mock.calls[0];
    expect(input.lines).toEqual([
      expect.objectContaining({ product_type: "accessory", quantity: 2, unit_value: 12, currency: "SGD" }),
    ]);
    expect(input.destination).toMatchObject({ country: "SG", postal_code: "123456" });

    expect(ordersInserted()[0].row).toMatchObject({
      shipping_amount: 7.5,
      shipping_courier: "Ninja Van Standard",
    });
    expect(ordersInserted()[0].row).not.toHaveProperty("shipping_carrier_cost");
    expect(h.inserts.find((i) => i.table === "order_shipments")?.row).toEqual({
      order_id: "order-1",
      courier_service_id: "cs_ninja",
      quoted_carrier_cost: 6.42,
    });
    expect(h.sessionsCreate.mock.calls[0][0].shipping_options[0].shipping_rate_data).toMatchObject({
      fixed_amount: { amount: 750, currency: "sgd" },
      display_name: "Standard — Ninja Van Standard",
    });
  });

  it("refuses an address no courier on the method serves, before any write", async () => {
    h.tables.shipping_methods = liveMethod;
    h.quoteShippingMethods.mockResolvedValue({ options: [], rates: null });
    const res = await post([{ variant_id: ACCESSORY_VARIANT, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect(ordersInserted()).toHaveLength(0);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a method that does not deliver to the address's country", async () => {
    h.tables.shipping_methods = { ...liveMethod, rate_source: "flat", countries: ["MY"] };
    const res = await post([{ variant_id: ACCESSORY_VARIANT, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect(ordersInserted()).toHaveLength(0);
  });

  it("leaves a flat method's pricing and the courier columns alone", async () => {
    h.tables.shipping_methods = { ...liveMethod, rate_source: "flat" };
    const res = await post([{ variant_id: ACCESSORY_VARIANT, quantity: 1 }]);
    expect(res.status).toBe(200);
    expect(h.quoteShippingMethods).not.toHaveBeenCalled();
    const order = ordersInserted()[0].row as Record<string, unknown>;
    expect(order.shipping_amount).toBe(8);
    expect(order).not.toHaveProperty("shipping_courier");
    expect(h.inserts.some((i) => i.table === "order_shipments")).toBe(false);
  });
});

describe("POST /api/shop/checkout — standard stock is checked per Variant", () => {
  it("refuses two lines of the same variant that together exceed stock", async () => {
    const res = await post([
      { variant_id: ACCESSORY_VARIANT, quantity: 3 },
      { variant_id: ACCESSORY_VARIANT, quantity: 3 },
    ]);
    expect(res.status).toBe(400);
    expect(ordersInserted()).toHaveLength(0);
  });

  it("still accepts two lines of the same variant within stock", async () => {
    const res = await post([
      { variant_id: ACCESSORY_VARIANT, quantity: 3 },
      { variant_id: ACCESSORY_VARIANT, quantity: 2 },
    ]);
    expect(res.status).toBe(200);
  });
});


const apply = (body: Record<string, unknown>) =>
  customize(
    new Request("https://x.test/api/shop/customize?action=apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: PILLOW_VARIANT, pillow_product_id: 7, ...body }),
    }),
  );

const cheapRoleLines = [
  { item_id: 7, category: "cover", name: "Satin Cover", quantity: 1, is_addon: false, price_delta: 0 },
  { item_id: 8, category: "case", name: "Linen Case", quantity: 1, is_addon: false, price_delta: 0 },
];

describe("a customised bolster line takes the Variant of the length that is built", () => {
  it("records the config's length on the order, whatever length was posted", async () => {
    h.tables.customization_configs = [bolsterConfig("short")];
    const res = await post([{ variant_id: BOLSTER_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(h.loadComposedSellable).toHaveBeenCalledWith(expect.anything(), {
      productType: "bolster",
      length: "short",
    });
    const [orderItem] = h.inserts.find((i) => i.table === "order_items")!.row as Array<
      Record<string, unknown>
    >;
    expect(orderItem).toMatchObject({
      variant_id: BOLSTER_SHORT_VARIANT,
      variant_title: "Short",
      sku: "MBOLSTER-SHORT",
      unit_price: 200,
    });
    expect(stripeLines()).toEqual([{ price: `price_${BOLSTER_SHORT_VARIANT}`, quantity: 1 }]);
  });
});

describe("what is priced is what is built", () => {
  it("apply refuses a cover or case the size does not offer, before saving anything", async () => {
    const res = await apply({ component_quantities: cheapRoleLines });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not offered/);
    expect(h.inserts.filter((i) => i.table === "customization_configs")).toHaveLength(0);
  });

  it("checkout refuses a stored config whose lines are not a real build", async () => {
    h.tables.customization_configs = [pillowConfig({ config_lines: cheapRoleLines, total_addon_price: -88 })];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not offered/);
    expect(ordersInserted()).toHaveLength(0);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("takes each line's role and name from the database, not the browser", async () => {
    const res = await apply({
      component_quantities: [
        { ...fibrecoolLines[0], name: "Anything" },
        { ...fibrecoolLines[1], category: "protector", name: "Free upgrade" },
      ],
      filling_lines: [{ item_id: 5, subtype: "made-up", name: "Gold", quantity: 2 }],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { total_addon_price: number }).total_addon_price).toBe(COMPOSED - 170);
    const stored = h.inserts.find((i) => i.table === "customization_configs")!.row as {
      config_lines: Array<{ name: string; category: string }>;
      filling_lines: Array<{ name: string; subtype: string }>;
      summary: string;
    };
    expect(stored.config_lines.map((l) => [l.name, l.category])).toEqual([
      ["Satin Cover", "cover"],
      ["Fibrecool Case", "case"],
    ]);
    expect(stored.filling_lines).toEqual([{ item_id: 5, subtype: "3D-S", name: "3D Fibre", quantity: 2 }]);
    expect(stored.summary).toBe("2× 3D-S | Cover: Satin Cover | Case: Fibrecool Case");
  });

  it("apply refuses a filling that is no longer offered", async () => {
    const retired = await apply({
      component_quantities: fibrecoolLines,
      filling_lines: [{ item_id: 6, subtype: "6D-L", name: "6D", quantity: 1 }],
    });
    expect(retired.status).toBe(400);
    expect(((await retired.json()) as { error: string }).error).toMatch(/only fillings/);
    expect(h.inserts.filter((i) => i.table === "customization_configs")).toHaveLength(0);
  });

  it("apply refuses more filling than a pillow holds, even when it is in stock", async () => {
    h.tables.inventory_balances = items.map((i) => ({ item_id: i.id, on_hand: 1000 }));
    const overfilled = await apply({
      component_quantities: fibrecoolLines,
      filling_lines: [{ item_id: 5, subtype: "3D-S", name: "3D", quantity: 226 }],
    });
    expect(overfilled.status).toBe(400);
    expect(((await overfilled.json()) as { error: string }).error).toMatch(/at most 225 filling pieces/);
    expect(h.inserts.filter((i) => i.table === "customization_configs")).toHaveLength(0);
  });
});

describe("customised component stock is checked across lines", () => {
  it("refuses two customised lines that together need more of a component than stock", async () => {
    h.tables.inventory_balances = items.map((i) => ({ item_id: i.id, on_hand: i.id === 32 ? 5 : 100 }));
    const res = await post([
      { variant_id: PILLOW_VARIANT, quantity: 3, customization_id: CONFIG },
      { variant_id: PILLOW_VARIANT, quantity: 3, customization_id: CONFIG },
    ]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Insufficient component stock.*Fibrecool/);
    expect(ordersInserted()).toHaveLength(0);
  });
});

describe("a bolster only takes a case cut for its length", () => {
  const longWithShortCase = {
    product_type: "bolster",
    variant_id: BOLSTER_VARIANT,
    ecom_product_id: BOLSTER_PRODUCT,
    bolster_variant: "long",
    component_quantities: [caseLine(64)],
  };

  it("the configurator is only offered cases for the recommended length", async () => {
    const res = await recommend({ bolster_preferences: { height_cm: 185, sleep_position: "side" } });
    const data = (await res.json()) as RecommendationResponseData;
    expect(data.components.cases.map((c) => c.item_id)).toEqual([86]);
  });

  it("apply refuses a long bolster with the short case", async () => {
    const res = await apply(longWithShortCase);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not offered/);
    expect(h.inserts.filter((i) => i.table === "customization_configs")).toHaveLength(0);
  });

  it("checkout refuses a stored long bolster config with the short case", async () => {
    h.tables.customization_configs = [bolsterConfig("long", { config_lines: [caseLine(64)] })];
    const res = await post([{ variant_id: BOLSTER_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });
});

function recommend(body: Record<string, unknown>) {
  return customize(
    new Request("https://x.test/api/shop/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function honestRoundTrip(
  productType: "pillow" | "bolster",
  pick: { cover?: number; case?: number } = {},
) {
  const rec = await recommend(
    productType === "bolster"
      ? { bolster_preferences: { height_cm: 185, sleep_position: "side" } }
      : { preferences: { sleep_position: "side", body_type: "average", firmness: "medium" } },
  );
  expect(rec.status).toBe(200);
  const data = (await rec.json()) as RecommendationResponseData;
  const selectedCover = pick.cover ?? null;
  const selectedCase = pick.case ?? null;
  const componentLines = computeComponentLines(data, selectedCover, selectedCase, new Map());

  const payload = buildCustomizeApplyPayload({
    productType,
    recommendation: data,
    fillingLines: computeFillingLines(data, null),
    componentLines,
    selectedCover,
    selectedCase,
    selectedUpsells: new Set(),
    selectedTemplateId: null,
    llmMetadata: {},
  });
  const applied = await customize(
    new Request("https://x.test/api/shop/customize?action=apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const appliedBody = (await applied.json()) as { total_addon_price: number; error?: unknown };
  expect(appliedBody.error).toBeUndefined();
  expect(applied.status).toBe(200);

  const stored = h.inserts.find((i) => i.table === "customization_configs")!.row as Record<string, unknown>;
  h.tables.customization_configs = [{ id: CONFIG, ...stored }];
  const res = await post([{ variant_id: data.variant!.id, quantity: 1, customization_id: CONFIG }]);
  expect(res.status).toBe(200);
  const [line] = stripeLines();
  const charged = line.price_data
    ? line.price_data.unit_amount / 100
    : (h.tables.product_variants as typeof variants).find((v) => `price_${v.id}` === line.price)!.price;

  return {
    preview: data.variant!.price + computeAddonPrice(data, componentLines),
    cart: data.variant!.price + appliedBody.total_addon_price,
    charged,
  };
}

describe("honest path — Stripe charges what the configurator showed", () => {
  const usePremium = () => {
    pillowSellable = premiumXs;
    h.tables.pillow_products = { id: 7, size: "XS", kind: "premium" };
    h.tables.bom_lines = bomRows(7, premiumXs.bomLines);
    h.tables.product_variants = variants.map((v) => (v.id === PILLOW_VARIANT ? { ...v, price: 360 } : v));
  };
  const asShipped = () => {};

  it.each([
    { name: "basic, as it ships", setup: asShipped, type: "pillow" as const, pick: {}, total: 170 },
    { name: "basic, Fibrecool case", setup: asShipped, type: "pillow" as const, pick: { case: 32 }, total: 193 },
    { name: "premium, as it ships", setup: usePremium, type: "pillow" as const, pick: {}, total: 360 },
    { name: "premium, linen case", setup: usePremium, type: "pillow" as const, pick: { case: 42 }, total: 340 },
    { name: "bolster, as it ships", setup: asShipped, type: "bolster" as const, pick: {}, total: 230 },
  ])("$name: preview, cart and Stripe all read $total", async ({ setup, type, pick, total }) => {
    setup();
    const { preview, cart, charged } = await honestRoundTrip(type, pick);
    expect({ preview, cart, charged }).toEqual({ preview: total, cart: total, charged: total });
  });
});
