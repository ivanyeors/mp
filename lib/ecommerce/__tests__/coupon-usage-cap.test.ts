import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb, rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => ({ ...fakeSupabaseAdmin(h.db), rpc: h.rpc }) };
});

const { incrementCouponUsage } = await import("@/lib/ecommerce/discounts");

beforeEach(() => {
  h.db = { coupons: [] };
  h.rpc = vi.fn();
});

describe("incrementCouponUsage: capped RPC path", () => {
  it("returns true and calls the RPC when the increment applies", async () => {
    h.rpc = vi.fn(async () => ({ data: 1, error: null }));
    expect(await incrementCouponUsage("c1")).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("increment_coupon_usage", { coupon_id: "c1" });
  });

  it("returns false when the RPC reports the limit was already reached (null)", async () => {
    h.rpc = vi.fn(async () => ({ data: null, error: null }));
    expect(await incrementCouponUsage("c1")).toBe(false);
  });
});

describe("incrementCouponUsage: fallback still enforces the cap", () => {
  beforeEach(() => {
    h.rpc = vi.fn(async () => ({ data: null, error: { message: "function increment_coupon_usage does not exist" } }));
  });

  it("does not increment past a usage_limit that is already reached", async () => {
    h.db.coupons = [{ id: "c1", usage_count: 1, usage_limit: 1 }];
    expect(await incrementCouponUsage("c1")).toBe(false);
    expect(h.db.coupons[0].usage_count).toBe(1);
  });

  it("increments and returns true while under the limit", async () => {
    h.db.coupons = [{ id: "c1", usage_count: 0, usage_limit: 1 }];
    expect(await incrementCouponUsage("c1")).toBe(true);
    expect(h.db.coupons[0].usage_count).toBe(1);
  });

  it("always increments an unlimited coupon (null usage_limit)", async () => {
    h.db.coupons = [{ id: "c1", usage_count: 5, usage_limit: null }];
    expect(await incrementCouponUsage("c1")).toBe(true);
    expect(h.db.coupons[0].usage_count).toBe(6);
  });
});

describe("the coupon usage cap migration", () => {
  const sql = readFileSync(
    join(__dirname, "../../..", "supabase/migrations/20261025000000_coupon_usage_cap.sql"),
    "utf8",
  );

  it("enforces usage_limit in one UPDATE and reports whether it applied", () => {
    expect(sql).toMatch(/usage_count\s*<\s*usage_limit/);
    expect(sql).toContain("returning usage_count");
  });

  it("keeps the search_path pin and the service_role-only grant", () => {
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain(
      "grant execute on function public.increment_coupon_usage(uuid) to service_role",
    );
  });
});
