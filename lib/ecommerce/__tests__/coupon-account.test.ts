import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { checkCoupon, COUPON_SIGN_IN_ERROR } = await import("@/lib/ecommerce/discounts");
import type { Coupon } from "@/lib/types/ecommerce";

const coupon = (extra: Partial<Coupon> = {}) =>
  ({
    id: "c1",
    code: "ONCEEACH",
    discount_type: "fixed_amount",
    discount_value: 10,
    currency: "SGD",
    usage_limit: null,
    usage_count: 0,
    per_customer_limit: 1,
    min_order_amount: null,
    max_discount: null,
    starts_at: null,
    expires_at: null,
    applies_to: null,
    is_active: true,
    customer_id: null,
    ...extra,
  }) as Coupon;

const ANA = { customerId: "cust-ana", email: "ana@x.test" };

beforeEach(() => {
  h.db = { orders: [], mp_config_responses: [] };
});

describe("checkCoupon — per-customer and account-bound codes", () => {
  it("a code with no per-customer limit works for a guest", async () => {
    expect((await checkCoupon(coupon({ per_customer_limit: null }), 100, undefined, undefined, { customerEmail: "g@x.test" })).valid).toBe(true);
  });

  it("a per-customer code asks a guest to sign in", async () => {
    expect(await checkCoupon(coupon(), 100, undefined, undefined, { customerEmail: "g@x.test" })).toEqual({
      valid: false,
      error: COUPON_SIGN_IN_ERROR,
    });
  });

  it("a signed-in customer cannot dodge the count by typing another email", async () => {
    const res = await checkCoupon(coupon(), 100, undefined, undefined, { customerEmail: "fresh@x.test", account: ANA });
    expect(res).toEqual({ valid: false, error: COUPON_SIGN_IN_ERROR });
  });

  it("counts the account's own uses: by its Customer, and by its email for older guest orders", async () => {
    expect((await checkCoupon(coupon(), 100, undefined, undefined, { customerEmail: "ana@x.test", account: ANA })).valid).toBe(true);
    h.db.orders.push({ id: "o1", coupon_id: "c1", customer_id: null, email: "Ana@x.test", status: "confirmed", paid_at: "2026-10-01T00:00:00Z" });
    expect((await checkCoupon(coupon(), 100, undefined, undefined, { customerEmail: "ana@x.test", account: ANA })).valid).toBe(false);
    h.db.orders = [{ id: "o2", coupon_id: "c1", customer_id: "cust-ana", email: "old@x.test", status: "confirmed", paid_at: "2026-10-01T00:00:00Z" }];
    expect((await checkCoupon(coupon(), 100, undefined, undefined, { customerEmail: "ana@x.test", account: ANA })).valid).toBe(false);
  });

  it("a voucher bound to one Customer works only for them, and reads as unknown to anyone else", async () => {
    const voucher = coupon({ per_customer_limit: 1, usage_limit: 1, customer_id: "cust-ana" });
    expect((await checkCoupon(voucher, 100, undefined, undefined, { customerEmail: "ana@x.test", account: ANA })).valid).toBe(true);
    const ben = { customerId: "cust-ben", email: "ben@x.test" };
    expect(await checkCoupon(voucher, 100, undefined, undefined, { customerEmail: "ben@x.test", account: ben })).toEqual({
      valid: false,
      error: "This code isn't valid",
    });
    expect((await checkCoupon(voucher, 100, undefined, undefined, { customerEmail: "ana@x.test" })).valid).toBe(false);
  });
});
