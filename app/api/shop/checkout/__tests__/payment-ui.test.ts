import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const SHIPPING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  sessionsCreate: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const base = fakeSupabaseAdmin(h.db);
      return {
        from: (table: string) => base.from(table),
        async rpc(fn: string) {
          if (fn === "rate_limit_hit") return { data: false, error: null };
          return { data: null, error: { message: `unexpected rpc ${fn}` } };
        },
      };
    },
  };
});
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: vi.fn(async () => null) }));
vi.mock("@/lib/analytics/journey/stitch-server", () => ({ stitchShopperVisitor: async () => {} }));
vi.mock("@/lib/auth/partner", () => ({
  getPartnerContext: vi.fn(async () => null),
  isPartnerActive: () => false,
}));
vi.mock("@/lib/partner-self-purchase/allowance", () => ({
  loadSelfPurchaseAllowance: async () => ({ kind: null, amount: 0, unitCap: 0, usedUnits: 0 }),
}));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => null,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } }, coupons: { create: vi.fn() } }),
}));

const { POST: checkout } = await import("@/app/api/shop/checkout/route");

const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  h.sessionsCreate.mockImplementation(async (params: { ui_mode?: string }) =>
    params.ui_mode === "elements"
      ? { id: "cs_test_1", url: null, client_secret: "cs_test_1_secret_abc" }
      : { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1", client_secret: null },
  );
  h.db = {
    product_variants: [
      {
        id: VARIANT,
        product_id: PRODUCT,
        title: "Bamboo Pillow Case",
        sku: "CASE",
        price: 50,
        currency: "SGD",
        cost_price: null,
        is_active: true,
        stripe_price_id: "price_case",
        stripe_price_id_test: "price_case",
        products: { id: PRODUCT, slug: "case", product_type: "accessory", category_id: null, content: {} },
      },
    ],
    variant_stock: [{ variant_id: VARIANT, stock_available: 10 }],
    coupons: [],
    customers: [],
    shipping_methods: [
      { id: SHIPPING, slug: "std", base_rate: 5, free_above: null, currency: "SGD", is_active: true, content: {}, countries: [] },
    ],
    site_settings: [],
    orders: [],
    order_items: [],
  };
});

afterEach(() => {
  if (PUBLISHABLE === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = PUBLISHABLE;
});

function pay(paymentUi?: "hosted" | "elements") {
  return checkout(
    new Request("https://x.test/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "wei.ling@example.com",
        shipping_address: {
          recipient: "Tan Wei Ling",
          line1: "18 Cross Street",
          city: "Singapore",
          postal_code: "048423",
          country: "SG",
        },
        shipping_method_id: SHIPPING,
        items: [{ variant_id: VARIANT, quantity: 1 }],
        ...(paymentUi ? { payment_ui: paymentUi } : {}),
      }),
    }),
  ).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

const sessionParams = () => h.sessionsCreate.mock.calls[0][0] as Record<string, unknown>;

describe("shop checkout: where the shopper pays", () => {
  it("opens an on-page Session and returns its client secret when the page asks and the key matches", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc";
    const res = await pay("elements");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      payment_ui: "elements",
      client_secret: "cs_test_1_secret_abc",
      session_id: "cs_test_1",
    });
    expect(res.body).not.toHaveProperty("checkout_url");

    const params = sessionParams();
    expect(params.ui_mode).toBe("elements");
    expect(params.return_url).toMatch(/\/shop\/checkout\/confirmation\?order_number=.+&session_id=\{CHECKOUT_SESSION_ID\}$/);
    expect(params).not.toHaveProperty("success_url");
    expect(params).not.toHaveProperty("cancel_url");
    expect(params.metadata).toMatchObject({ order_id: expect.any(String) });
  });

  it("stays on Stripe's page when this deploy has no publishable key", async () => {
    const res = await pay("elements");
    expect(res.body).toMatchObject({ payment_ui: "hosted", checkout_url: "https://checkout.stripe.test/cs_test_1" });
    expect(sessionParams()).not.toHaveProperty("ui_mode");
    expect(sessionParams().success_url).toMatch(/session_id=\{CHECKOUT_SESSION_ID\}$/);
  });

  it("stays on Stripe's page when the publishable key is from the other mode", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_abc";
    const res = await pay("elements");
    expect(res.body).toMatchObject({ payment_ui: "hosted" });
    expect(sessionParams()).not.toHaveProperty("ui_mode");
  });

  it("keeps an old checkout tab, which sends nothing, on Stripe's page", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc";
    const res = await pay();
    expect(res.body).toMatchObject({ payment_ui: "hosted", checkout_url: expect.any(String) });
  });

  it("undoes the Order when Stripe returns no way to pay it", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc";
    h.sessionsCreate.mockImplementation(async () => ({ id: "cs_test_1", url: null, client_secret: null }));
    const res = await pay("elements");
    expect(res.status).toBe(500);
    expect(h.db.orders).toHaveLength(0);
  });
});
