import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { resetRateLimits } from "@/lib/rate-limit";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { POST } = await import("@/app/api/checkout/code/route");

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

const PILLOW_PRODUCT = "11111111-1111-4111-8111-111111111111";
const SHOP_PRODUCT = "22222222-2222-4222-8222-222222222222";

const shop = (subtotal: number) => ({
  flow: "shop",
  subtotal,
  line_items: [{ product_id: SHOP_PRODUCT, line_total: subtotal }],
});
const pillow = (goods: number) => ({
  flow: "customisation",
  build: { product_type: "pillow", size: "M", tier: "premium" },
  goods,
});

function post(body: unknown, ip = "203.0.113.7") {
  return POST(
    new Request("https://x.test/api/checkout/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetRateLimits();
  h.db = {
    coupons: [
      { ...coupon },
      { ...coupon, id: "coupon-ship", code: "FREESHIP", discount_type: "free_shipping", discount_value: 1 },
      {
        ...coupon,
        id: "coupon-pillow",
        code: "PILLOW20",
        discount_value: 20,
        applies_to: { product_ids: [PILLOW_PRODUCT] },
      },
      { ...coupon, id: "coupon-one", code: "ONEUSE", usage_limit: 1, usage_count: 0 },
    ],
    partners: [{ id: "partner-1", name: "Spine Clinic", type: "partner", referral_code: "ABCD2345" }],
    products: [
      { id: PILLOW_PRODUCT, category_id: null, product_type: "pillow" },
      { id: SHOP_PRODUCT, category_id: null, product_type: "accessory" },
    ],
    pillow_products: [{ id: 7, size: "M", kind: "premium", is_active: true }],
    product_variants: [{ id: "v-1", product_id: PILLOW_PRODUCT, pillow_product_id: 7 }],
    mp_config_responses: [],
  };
});

describe("POST /api/checkout/code", () => {
  it("reports a discount without handing back the coupon row", async () => {
    const res = await post({ code: "staff10", context: shop(100) });
    const json = await res.json();
    expect(json).toMatchObject({ kind: "discount", code: "STAFF10", discount_amount: 10, free_shipping: false });
    expect(json).not.toHaveProperty("coupon");
    expect(JSON.stringify(json)).not.toContain("coupon-staff10");
    expect(JSON.stringify(json)).not.toContain("usage_limit");
  });

  it("reports free shipping as a flag", async () => {
    const json = await (await post({ code: "freeship", context: shop(100) })).json();
    expect(json).toMatchObject({ kind: "discount", free_shipping: true });
  });

  it("names the partner for a referral code, never its id", async () => {
    const json = await (await post({ code: " abcd2345 ", context: shop(100) })).json();
    expect(json).toEqual({ ok: true, kind: "referral", partner_name: "Spine Clinic", discount_amount: 0 });
    expect(JSON.stringify(json)).not.toContain("partner-1");
  });

  it("does not read a wildcard as a pattern", async () => {
    const json = await (await post({ code: "STAFF%", context: shop(100) })).json();
    expect(json).toEqual({ ok: true, kind: "unknown" });
  });

  it("prices a customisation from its goods", async () => {
    const json = await (await post({ code: "STAFF10", context: pillow(360) })).json();
    expect(json).toMatchObject({ kind: "discount", discount_amount: 36 });
  });

  it("applies a coupon scoped to the Mpillow product to an Mpillow customisation only", async () => {
    expect(await (await post({ code: "PILLOW20", context: pillow(300) })).json()).toMatchObject({
      kind: "discount",
      discount_amount: 60,
    });
    expect(await (await post({ code: "PILLOW20", context: shop(300) })).json()).toMatchObject({
      kind: "invalid",
    });
  });

  it("counts a customisation already holding a single-use code", async () => {
    h.db.mp_config_responses.push({
      id: "result-1",
      coupon_id: "coupon-one",
      status: "held",
      order_id: null,
      payment_intent_id: "pi_1",
      authorized_amount: 300,
      customer_email: "a@example.com",
    });
    const json = await (await post({ code: "ONEUSE", context: pillow(300) })).json();
    expect(json).toMatchObject({ kind: "invalid", reason: "This code has been fully redeemed" });
  });

  it("does not count a Checkout that was opened and abandoned", async () => {
    h.db.mp_config_responses.push({
      id: "result-2",
      coupon_id: "coupon-one",
      status: "held",
      order_id: null,
      payment_intent_id: null,
      authorized_amount: 300,
      customer_email: "a@example.com",
    });
    const json = await (await post({ code: "ONEUSE", context: pillow(300) })).json();
    expect(json).toMatchObject({ kind: "discount" });
  });

  it("with nothing priced yet, says a usable discount code is one, without an amount", async () => {
    const json = await (await post({ code: "PILLOW20", context: { flow: "none" } })).json();
    expect(json).toEqual({ ok: true, kind: "discount", code: "PILLOW20", discount_amount: null, free_shipping: false });
  });

  it("with nothing priced yet, still turns down a code that is used up", async () => {
    h.db.mp_config_responses.push({
      id: "result-3",
      coupon_id: "coupon-one",
      status: "assigned",
      order_id: null,
      payment_intent_id: null,
      authorized_amount: null,
      customer_email: "a@example.com",
    });
    const json = await (await post({ code: "ONEUSE", context: { flow: "none" } })).json();
    expect(json).toMatchObject({ kind: "invalid" });
  });

  it("refuses an over-long code before any lookup", async () => {
    const res = await post({ code: "A".repeat(65), context: shop(100) });
    expect(res.status).toBe(400);
  });

  it("meters guessing per IP", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 61; i++) last = await post({ code: `GUESS${i}`, context: shop(100) });
    expect(last!.status).toBe(429);
    expect((await post({ code: "STAFF10", context: shop(100) }, "198.51.100.2")).status).toBe(200);
  });
});
