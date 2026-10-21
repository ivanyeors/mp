import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * The coupon preview resolves who is buying from the session, never from the
 * request body (ADR 0029 g). It used to take `customer_id` from the body.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, session: null as string | null }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/shop/customer-addresses", () => ({
  getCurrentCustomerId: vi.fn(async () => h.session),
}));

const { POST } = await import("@/app/api/shop/coupons/validate/route");
const { BOUND_COUPON_ERROR } = await import("@/lib/ecommerce/discounts");

const OWNER = "8b1c3f9e-0000-4000-8000-000000000001";
const OTHER = "8b1c3f9e-0000-4000-8000-000000000002";

function post(body: unknown) {
  return POST(
    new Request("https://x.test/api/shop/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ).then((r) => r.json());
}

beforeEach(() => {
  h.session = null;
  h.db = {
    coupons: [
      {
        id: "coupon-wb",
        code: "WB-7KQ4MZP2XH",
        discount_type: "fixed_amount",
        discount_value: 20,
        currency: "SGD",
        min_order_amount: null,
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
  };
});

describe("POST /api/shop/coupons/validate with a bound voucher", () => {
  it("ignores a customer_id in the body: a guest claiming to be the owner is refused", async () => {
    const json = await post({
      code: "WB-7KQ4MZP2XH",
      subtotal: 100,
      email: "wei.ling@example.com",
      customer_id: OWNER,
    });
    expect(json).toEqual({ ok: true, valid: false, reason: BOUND_COUPON_ERROR });
  });

  it("refuses a different signed-in Customer", async () => {
    h.session = OTHER;
    const json = await post({ code: "WB-7KQ4MZP2XH", subtotal: 100, email: "someone@example.com" });
    expect(json.reason).toBe(BOUND_COUPON_ERROR);
  });

  it("refuses the owner under a different email", async () => {
    h.session = OWNER;
    const json = await post({ code: "WB-7KQ4MZP2XH", subtotal: 100, email: "someone@example.com" });
    expect(json.reason).toBe(BOUND_COUPON_ERROR);
  });

  it("accepts the signed-in owner with their own email, and hands back no coupon row", async () => {
    h.session = OWNER;
    const json = await post({ code: "WB-7KQ4MZP2XH", subtotal: 100, email: "wei.ling@example.com" });
    expect(json).toEqual({ ok: true, valid: true, discount_amount: 20, free_shipping: false });
  });
});
