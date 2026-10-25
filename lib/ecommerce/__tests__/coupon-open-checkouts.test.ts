import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { checkCoupon } = await import("@/lib/ecommerce/discounts");
import type { Coupon } from "@/lib/types/ecommerce";

const coupon = {
  id: "c1",
  code: "ONCE",
  type: "percentage",
  value: 10,
  currency: "SGD",
  usage_limit: 1,
  usage_count: 0,
  per_customer_limit: null,
  min_order_amount: null,
  starts_at: null,
  expires_at: null,
  applies_to: { type: "all" },
  is_active: true,
} as unknown as Coupon;

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

beforeEach(() => {
  h.db = { orders: [], mp_config_responses: [] };
});

describe("checkCoupon — open checkouts hold a use", () => {
  it("a usage_limit = 1 code is taken while another checkout with it is still open", async () => {
    expect((await checkCoupon(coupon, 100)).valid).toBe(true);
    h.db.orders.push({ id: "o1", coupon_id: "c1", status: "pending", paid_at: null, created_at: hoursAgo(1) });
    expect(await checkCoupon(coupon, 100)).toMatchObject({ valid: false });
  });

  it("an expired, unpaid checkout no longer holds it", async () => {
    h.db.orders.push({ id: "o1", coupon_id: "c1", status: "pending", paid_at: null, created_at: hoursAgo(30) });
    expect((await checkCoupon(coupon, 100)).valid).toBe(true);
  });
});
