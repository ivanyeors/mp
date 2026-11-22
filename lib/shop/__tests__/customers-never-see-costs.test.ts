import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BANNED = /cost|cogs|margin|markup|total_charge|rate_rounding/i;

function costKeysIn(value: unknown, at = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => costKeysIn(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(BANNED.test(k) ? [`${at}.${k}`] : []),
      ...costKeysIn(v, `${at}.${k}`),
    ]);
  }
  return [];
}

const h = vi.hoisted(() => {
  const tables: Record<string, unknown[]> = {};
  const db = () => ({
    from(table: string) {
      const rows = () => tables[table] ?? [];
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "not", "order", "limit", "contains"]) b[m] = () => b;
      b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      b.single = async () => ({ data: rows()[0] ?? null, error: null });
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve);
      return b;
    },
  });
  return { tables, db, methods: [] as unknown[], quoteOptions: [] as unknown[] };
});

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: h.db }));
vi.mock("@/lib/supabase/ssr-server", () => ({ createSupabaseServerClient: async () => h.db() }));
vi.mock("@/lib/auth/admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/admin")>()),
  getAdminContext: async () => null,
}));
vi.mock("@/lib/shop/shipping-methods", () => ({ readShippingMethods: async () => h.methods }));
vi.mock("@/lib/locations", async (orig) => ({
  ...(await orig<typeof import("@/lib/locations")>()),
  getLocations: async () => [{ id: "studio-1", name: "Mpillow studio", address: "1 Studio Road" }],
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitExceeded: async () => false, clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/shipping/lines", async (orig) => ({
  ...(await orig<typeof import("@/lib/shipping/lines")>()),
  loadShippableLines: async () => [
    { product_type: "pillow", quantity: 1, weight_grams: 1200, unit_value: 189, currency: "SGD", description: "Mpillow", sku: "MP-M" },
  ],
}));
vi.mock("@/lib/shipping/quote", async (orig) => ({
  ...(await orig<typeof import("@/lib/shipping/quote")>()),
  quoteShippingMethods: async () => ({
    options: h.quoteOptions,
    rates: { ok: true, rates: [{ courier_service_id: "cs-1", total_charge: 18.4, currency: "SGD" }], quoteId: null, cached: false },
  }),
}));
vi.mock("@/lib/results/access", () => ({ authorizeResultAccess: async () => true }));
vi.mock("@/lib/config-upload", () => ({ listConfigUploads: async () => [] }));

const { buildResultOrderSnapshot } = await import("@/lib/results/order-build-snapshot");
const customerOrders = await import("@/lib/shop/customer-orders");
const { PUBLIC_PRODUCT_COLUMNS, PUBLIC_VARIANT_COLUMNS } = await import("@/lib/ecommerce/products");
const byNumber = await import("@/app/api/shop/orders/by-number/[orderNumber]/route");
const shippingList = await import("@/app/api/shop/shipping/route");
const shippingQuote = await import("@/app/api/shop/shipping/quote/route");
const resultRoute = await import("@/app/api/results/[id]/route");
const servicePrices = await import("@/lib/pricing/service-prices");

const LIVE_METHOD = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "standard",
  content: { "en-US": { name: "Standard", description: "", estimated_days: "2-4" } },
  base_rate: 0,
  free_above: 300,
  currency: "SGD",
  countries: ["SG"],
  is_active: true,
  position: 0,
  rate_source: "easyship",
  easyship_strategy: "cheapest",
  easyship_courier_service_id: null,
  markup_percent: 15,
  markup_fixed: 2,
  rate_rounding: 0.5,
  collect_location_id: null,
};
const COLLECT_METHOD = {
  ...LIVE_METHOD,
  id: "22222222-2222-4222-8222-222222222222",
  slug: "self-collect",
  rate_source: "flat",
  collect_location_id: "studio-1",
};

const RESULT_ORDER = {
  id: "o-1",
  order_number: "MP-20261122-0001",
  stripe_session_id: "cs_test_1",
  status: "paid",
  total: 389,
  shipping_amount: 0,
  items: [
    {
      id: "oi-1",
      product_title: "Custom Mpillow M premium",
      unit_price: 349,
      total_price: 349,
      unit_cost: 120,
      total_cost: 120,
      kind: "goods",
      customization_snapshot: {
        result_id: "r-1",
        product_type: "pillow",
        build_lines: [{ item_id: 9, quantity: 2, role: "filling", name: "Latex shred", unit_cost: 4 }],
        cogs: 120,
        pricing: { goods: 349, services: 40, subtotal: 389, discount: 0, shipping: 0, tax: 0, total: 389 },
        service_lines: [{ key: "measurement_premium", label: "Measurement service (Premium)", msrp: 40, costPrice: 15 }],
      },
    },
  ],
};

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k];
  h.methods = [LIVE_METHOD, COLLECT_METHOD];
  h.quoteOptions = [
    {
      method: LIVE_METHOD,
      amount: 23.5,
      is_free: false,
      currency: "SGD",
      source: "easyship",
      courier: { service_id: "cs-1", name: "Ninja Van", umbrella_name: "Ninja Van" },
      carrier_cost: 18.4,
      min_days: 2,
      max_days: 4,
    },
  ];
});

describe("customers never see our costs (owner, 2026-11-22)", () => {
  it("a Result order line's snapshot carries no build or service cost", () => {
    const snapshot = buildResultOrderSnapshot({
      resultId: "r-1",
      productType: "pillow",
      assignedSize: "M",
      assignedTier: "premium",
      assignedLength: null,
      fillingTemplateId: 3,
      fillingTemplateName: "Medium firm",
      buildLines: [{ item_id: 9, quantity: 2, role: "filling", category: "filling" }],
      nameByItem: new Map([[9, "Latex shred"]]),
      pricing: { goods: 349, services: 40, subtotal: 389, discount: 0, shipping: 0, tax: 0, total: 389 },
      serviceLines: [{ key: "measurement_premium", label: "Measurement service (Premium)", msrp: 40, costPrice: 15 }],
    });
    expect(costKeysIn(snapshot)).toEqual([]);
    expect(snapshot.service_lines).toEqual([
      { key: "measurement_premium", label: "Measurement service (Premium)", msrp: 40 },
    ]);
  });

  it("the customer's order columns name no cost", () => {
    const columns = [
      ...customerOrders.CUSTOMER_ORDER_COLUMNS,
      ...customerOrders.CUSTOMER_ORDER_ITEM_COLUMNS,
      ...PUBLIC_PRODUCT_COLUMNS.split(", "),
      ...PUBLIC_VARIANT_COLUMNS.split(", "),
    ];
    expect(columns.filter((c) => BANNED.test(c))).toEqual([]);
  });

  it("/account/orders reads drop cost keys, even from a row written with them", async () => {
    h.tables.orders = [RESULT_ORDER];
    expect(costKeysIn(await customerOrders.getCustomerOrders())).toEqual([]);
    const one = await customerOrders.getCustomerOrderByNumber(RESULT_ORDER.order_number);
    expect(costKeysIn(one)).toEqual([]);
    expect(one?.items?.[0]?.customization_snapshot?.result_id).toBe("r-1");
  });

  it("the order confirmation endpoint drops cost keys", async () => {
    h.tables.orders = [RESULT_ORDER];
    const res = await byNumber.GET(
      new Request(`https://x.test/api/shop/orders/by-number/${RESULT_ORDER.order_number}?session_id=cs_test_1`),
      { params: Promise.resolve({ orderNumber: RESULT_ORDER.order_number }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.order_number).toBe(RESULT_ORDER.order_number);
    expect(costKeysIn(body)).toEqual([]);
  });

  it.each(["?country=SG", "?collect=1"])("the public shipping methods list (%s) carries no markup", async (query) => {
    const res = await shippingList.GET(new Request(`https://x.test/api/shop/shipping${query}`));
    const body = await res.json();
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows[0].slug).toBe("standard");
    expect(costKeysIn(body)).toEqual([]);
  });

  it("the shipping quote carries the price billed, never Easyship's charge", async () => {
    const res = await shippingQuote.POST(
      new Request("https://x.test/api/shop/shipping/quote", {
        method: "POST",
        body: JSON.stringify({
          items: [{ variant_id: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
          destination: { country: "SG", postal_code: "238801" },
        }),
      }),
    );
    const body = await res.json();
    expect(body.options).toEqual([expect.objectContaining({ slug: "standard", price: 23.5 })]);
    expect(costKeysIn(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("18.4");
  });

  it("a Result's status page payload carries no shipping rate or cost", async () => {
    h.tables.mp_config_responses = [
      {
        id: "r-1",
        status: "held",
        product_type: "pillow",
        suggested_size: "M",
        suggested_tier: "premium",
        shipping_method: "standard",
        shipping_address: { country: "SG", postal_code: "238801", line1: "1 Orchard Road" },
        shipping_rate: 18.4,
        authorized_amount: 389,
        final_amount: null,
        currency: "SGD",
        customer_email: "ada@example.test",
        payment_intent_id: "pi_1",
        paired_build_id: null,
        access_token: "tok",
        customer_id: null,
        source: "online_customization",
        measured_by_type: null,
        coupon_code: null,
        coupon_terms: null,
      },
    ];
    const res = await resultRoute.GET(new Request("https://x.test/api/results/r-1?token=tok"), {
      params: Promise.resolve({ id: "r-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.id).toBe("r-1");
    expect(body.result).not.toHaveProperty("shipping_rate");
    expect(costKeysIn(body)).toEqual([]);
  });

  it("the configurators get service fees without their cost", async () => {
    h.tables.service_prices = [
      { key: "measurement_premium", msrp: 50, cost_price: 18, currency: "SGD" },
      { key: "measurement_basic", msrp: 30, cost_price: 11, currency: "SGD" },
      { key: "readjustment", msrp: 30, cost_price: 9, currency: "SGD" },
    ];
    const fees = await servicePrices.loadServiceFees(h.db() as never);
    expect(fees.measurement_premium).toEqual({ msrp: 50, currency: "SGD" });
    expect(costKeysIn(fees)).toEqual([]);
  });

  it("no customer page loads service cost prices", () => {
    const root = path.resolve(import.meta.dirname, "../../../app/[lang]");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return name === "settings" || name === "__tests__" ? [] : walk(full);
        return /\.tsx?$/.test(name) ? [full] : [];
      });
    const offenders = walk(root)
      .filter((f) => readFileSync(f, "utf8").includes("loadServicePrices"))
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});
