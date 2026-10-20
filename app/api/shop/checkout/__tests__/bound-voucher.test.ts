import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Checkout is the authoritative check for a Welcome-back voucher (ADR 0028 g).
 * Real handler and real validateCoupon; only the tables and the session are
 * faked. A refused voucher stops checkout with its error. An accepted one lets
 * it carry on to the shipping method, which this fake leaves out on purpose so
 * the run stops there, before an Order or a Stripe session.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, session: null as string | null }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/shop/customer-addresses", () => ({
  getCurrentCustomerId: vi.fn(async () => h.session),
}));

const { POST: checkout } = await import("@/app/api/shop/checkout/route");
const { BOUND_COUPON_ERROR } = await import("@/lib/ecommerce/discounts");

const OWNER = "8b1c3f9e-0000-4000-8000-000000000001";
const OTHER = "8b1c3f9e-0000-4000-8000-000000000002";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const SHIPPING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NO_SHIPPING = "Invalid or unavailable shipping method";

beforeEach(() => {
  h.session = null;
  h.db = {
    product_variants: [
      {
        id: VARIANT,
        product_id: PRODUCT,
        title: "Bamboo Pillow Case",
        sku: "CASE",
        price: 60,
        currency: "SGD",
        cost_price: null,
        is_active: true,
        stripe_price_id: "price_case",
        stripe_price_id_test: "price_case",
        products: { id: PRODUCT, slug: "case", product_type: "accessory", category_id: null, content: {} },
      },
    ],
    variant_stock: [{ variant_id: VARIANT, stock_available: 10 }],
    coupons: [
      {
        id: "coupon-wb",
        code: "WB-7KQ4MZP2XH",
        discount_type: "fixed_amount",
        discount_value: 20,
        currency: "SGD",
        min_order_amount: 50,
        max_discount: null,
        usage_limit: 1,
        usage_count: 0,
        per_customer_limit: 1,
        starts_at: null,
        expires_at: null,
        applies_to: null,
        is_active: true,
        customer_id: OWNER,
        issued_for: "welcome_back",
      },
    ],
    customers: [
      { id: OWNER, email: "wei.ling@example.com" },
      { id: OTHER, email: "someone@example.com" },
    ],
    orders: [],
    shipping_methods: [],
  };
});

function pay(email: string) {
  return checkout(
    new Request("https://x.test/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        shipping_address: {
          recipient: "Tan Wei Ling",
          line1: "18 Cross Street",
          city: "Singapore",
          postal_code: "048423",
          country: "SG",
        },
        shipping_method_id: SHIPPING,
        coupon_code: "WB-7KQ4MZP2XH",
        items: [{ variant_id: VARIANT, quantity: 1 }],
      }),
    }),
  ).then(async (res) => ({ status: res.status, error: ((await res.json()) as { error?: unknown }).error }));
}

describe("checkout with a bound Welcome-back voucher", () => {
  it("refuses a guest, even one typing the owner's email", async () => {
    expect(await pay("wei.ling@example.com")).toEqual({ status: 400, error: BOUND_COUPON_ERROR });
  });

  it("refuses a different signed-in Customer", async () => {
    h.session = OTHER;
    expect(await pay("someone@example.com")).toEqual({ status: 400, error: BOUND_COUPON_ERROR });
    expect(await pay("wei.ling@example.com")).toEqual({ status: 400, error: BOUND_COUPON_ERROR });
  });

  it("refuses the owner checking out under a different email", async () => {
    h.session = OWNER;
    expect(await pay("someone@example.com")).toEqual({ status: 400, error: BOUND_COUPON_ERROR });
    expect(await pay("new.address@example.com")).toEqual({ status: 400, error: BOUND_COUPON_ERROR });
  });

  it("accepts the owner using their own email", async () => {
    h.session = OWNER;
    // Past the coupon, stopped at the shipping method this fake leaves out.
    expect(await pay("Wei.Ling@example.com")).toEqual({ status: 400, error: NO_SHIPPING });
  });
});
