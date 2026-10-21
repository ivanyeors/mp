import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * The anonymous coupon validator answers "is it valid, what does it take off,
 * is shipping free" and nothing else (#169). The coupon row carries usage
 * limits, scope and the stored code, none of which a shopper needs.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { POST } = await import("@/app/api/shop/coupons/validate/route");

const coupon = {
  id: "coupon-staff10",
  code: "STAFF10",
  discount_type: "percentage",
  discount_value: 10,
  currency: "SGD",
  min_order_amount: null,
  max_discount: null,
  usage_limit: 50,
  usage_count: 3,
  per_customer_limit: null,
  starts_at: null,
  expires_at: null,
  applies_to: null,
  is_active: true,
};

function post(body: unknown) {
  return POST(
    new Request("https://x.test/api/shop/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  h.db = {
    coupons: [
      { ...coupon },
      { ...coupon, id: "coupon-ship", code: "FREESHIP", discount_type: "free_shipping", discount_value: 1 },
    ],
  };
});

describe("POST /api/shop/coupons/validate", () => {
  it("has no `coupon` key on a valid code", async () => {
    const res = await post({ code: "staff10", subtotal: 100 });
    const json = await res.json();
    expect(json).toMatchObject({ valid: true, discount_amount: 10, free_shipping: false });
    expect(json).not.toHaveProperty("coupon");
    expect(JSON.stringify(json)).not.toContain("coupon-staff10");
    expect(JSON.stringify(json)).not.toContain("usage_limit");
  });

  it("reports free shipping as a flag", async () => {
    const json = await (await post({ code: "freeship", subtotal: 100 })).json();
    expect(json).toMatchObject({ valid: true, free_shipping: true });
    expect(json).not.toHaveProperty("coupon");
  });

  it("rejects a wildcard code", async () => {
    const json = await (await post({ code: "STAFF%", subtotal: 100 })).json();
    expect(json.valid).toBe(false);
    expect(json).not.toHaveProperty("coupon");
  });
});
