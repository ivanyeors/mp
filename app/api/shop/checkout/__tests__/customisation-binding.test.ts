import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A customised checkout line is bound to its build (#170).
 *
 * Real checkout handler, real pricing (`quoteCustomization` → `priceCustomizedBuild`
 * → `priceComposedBuild`) and real Stripe line construction. Only I/O is faked: the
 * Supabase tables, the Costings loader and the Stripe client, so the assertions read
 * the exact `line_items` Stripe would have been sent.
 */

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  inserts: [] as Array<{ table: string; row: unknown }>,
  sessionsCreate: vi.fn(),
  loadComposedSellable: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const result = () => ({ data: h.tables[table] ?? null, error: null });
      const one = () => {
        const { data } = result();
        return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null });
      };
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        eq: () => b,
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
vi.mock("@/lib/shop/customization-inventory", () => ({
  validateCustomizationConfig: async () => ({ valid: true, shortages: [] }),
}));
vi.mock("@/lib/ecommerce/customers", () => ({
  findOrCreateCustomer: async () => ({ id: "cust-1" }),
  findCustomerByEmail: async () => null,
}));
vi.mock("@/lib/ecommerce/discounts", () => ({ validateCoupon: vi.fn() }));
vi.mock("@/lib/referrals", () => ({ getPartnerByReferralCode: async () => null }));
vi.mock("@/lib/auth/partner", () => ({ getPartnerContext: async () => null, isPartnerActive: () => false }));
vi.mock("@/lib/partner-self-purchase/allowance", () => ({ loadSelfPurchaseAllowance: vi.fn() }));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => null,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } } }),
}));

const { POST: checkout } = await import("@/app/api/shop/checkout/route");
const { POST: customize } = await import("@/app/api/shop/customize/route");

const PILLOW_PRODUCT = "11111111-1111-4111-8111-111111111111";
const ACCESSORY_PRODUCT = "22222222-2222-4222-8222-222222222222";
const BOLSTER_PRODUCT = "33333333-3333-4333-8333-333333333333";
const PILLOW_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER_PILLOW_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ACCESSORY_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const BOLSTER_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
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
    option1: "long",
    price: 90,
    products: { id: BOLSTER_PRODUCT, slug: "mbolster", product_type: "bolster", content: {} },
  }),
];

/** Basic XS from Costings: row 170, satin cover 25, linen case 65; Fibrecool case 88. */
const basicXs = {
  bomLines: [
    { item_id: 1, quantity: 1, category: "cover" },
    { item_id: 42, quantity: 1, category: "pillow_case" },
  ],
  msrp: 170,
  priceFault: null,
  msrpByFamily: { "": 170 },
  defaultCover: { item_id: 1, msrp: 25, quantity: 1 },
  defaultCase: { item_id: 42, msrp: 65, family: "linen", quantity: 1 },
  caseOptions: [
    { item_id: 42, msrp: 65, family: "linen" },
    { item_id: 32, msrp: 88, family: "fibrecool" },
  ],
  coverOptions: [{ item_id: 1, msrp: 25 }],
  currency: "SGD",
};

/** Satin cover + Fibrecool case: 170 + (88 − 65) = 193. */
const fibrecoolLines = [
  { item_id: 1, category: "cover", name: "Satin", quantity: 1, is_addon: false, price_delta: 0 },
  { item_id: 32, category: "case", name: "Fibrecool", quantity: 1, is_addon: false, price_delta: 0 },
];
const COMPOSED = 193;

const pillowConfig = (over: Record<string, unknown> = {}) => ({
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
});

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
    pillow_products: { size: "XS", kind: "basic" },
    item_prices: [
      { item_id: 1, msrp: 25, cost_price: 5 },
      { item_id: 32, msrp: 88, cost_price: 20 },
    ],
    bom_lines: [],
    bolster_bom_lines: [],
    customers: null,
    shipping_methods: { id: SHIPPING, slug: "std", base_rate: 0, free_above: null, content: {} },
    orders: { id: "order-1", order_number: "MP-1" },
  };
  h.loadComposedSellable.mockResolvedValue({ ok: true, sellable: basicXs });
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
    // Default build, but the snapshot claims an upgrade: still the catalog Price.
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
    h.tables.customization_configs = [
      pillowConfig({
        product_type: "bolster",
        pillow_product_id: null,
        ecom_product_id: BOLSTER_PRODUCT,
        bolster_variant: "long",
      }),
    ];
    const res = await post([{ variant_id: BOLSTER_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(h.loadComposedSellable).toHaveBeenCalledWith(expect.anything(), {
      productType: "bolster",
      length: "long",
    });
    expect(stripeLines()[0].price_data.unit_amount).toBe(COMPOSED * 100);
  });

  it("refuses a bolster customisation posted with a variant of another product", async () => {
    h.tables.customization_configs = [
      pillowConfig({
        product_type: "bolster",
        pillow_product_id: null,
        ecom_product_id: BOLSTER_PRODUCT,
        bolster_variant: "long",
      }),
    ];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(400);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
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

describe("honest path — Stripe charges what the configurator showed", () => {
  it("customise → cart (variant.price + total_addon_price) → checkout agree to the cent", async () => {
    const applyRes = await customize(
      new Request("https://x.test/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: PILLOW_VARIANT,
          pillow_product_id: 7,
          component_quantities: fibrecoolLines,
        }),
      }),
    );
    expect(applyRes.status).toBe(200);
    const applied = (await applyRes.json()) as { total_addon_price: number };
    const stored = h.inserts.find((i) => i.table === "customization_configs")!.row as Record<string, unknown>;
    // What the cart shows: the variant's price plus the apply response's add-on.
    const shown = 170 + applied.total_addon_price;

    h.tables.customization_configs = [{ id: CONFIG, ecom_product_id: null, ...stored }];
    const res = await post([{ variant_id: PILLOW_VARIANT, quantity: 1, customization_id: CONFIG }]);
    expect(res.status).toBe(200);
    expect(stripeLines()[0].price_data.unit_amount).toBe(Math.round(shown * 100));
    expect(shown).toBe(COMPOSED);
  });
});
