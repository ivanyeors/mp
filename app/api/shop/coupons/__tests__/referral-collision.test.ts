import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Shop checkout and the customisation contact step take one code (ADR 0033):
 * a partner's referral code or a discount code. A coupon can therefore never
 * be saved under a code a partner already holds — the shopper typing it would
 * get one and not the other.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => null }));

const { POST } = await import("@/app/api/shop/coupons/route");
const { PATCH } = await import("@/app/api/shop/coupons/[id]/route");

const json = (body: unknown) =>
  new Request("https://x.test/api/shop/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.db = {
    partners: [{ id: "partner-1", type: "partner", referral_code: "ABCD2345" }],
    coupons: [{ id: "coupon-1", code: "SAVE10", discount_type: "percentage", discount_value: 10 }],
  };
});

describe("coupon codes never collide with referral codes", () => {
  it("refuses to create a coupon under a partner's referral code", async () => {
    const res = await POST(json({ code: "abcd2345", discount_type: "percentage", discount_value: 10 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/referral code/);
    expect(h.db.coupons).toHaveLength(1);
  });

  it("refuses to rename a coupon to a partner's referral code", async () => {
    const res = await PATCH(new Request("https://x.test", { method: "PATCH", body: JSON.stringify({ code: "ABCD2345" }) }), {
      params: Promise.resolve({ id: "coupon-1" }),
    });
    expect(res.status).toBe(409);
    expect(h.db.coupons[0].code).toBe("SAVE10");
  });

  it("creates any other coupon as before", async () => {
    const res = await POST(json({ code: "summer15", discount_type: "percentage", discount_value: 15 }));
    expect(res.status).toBe(200);
    expect(h.db.coupons.map((c) => c.code)).toContain("SUMMER15");
  });
});
