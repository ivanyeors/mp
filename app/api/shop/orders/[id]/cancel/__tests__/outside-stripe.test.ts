import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb, refundPayment: vi.fn(), timeline: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refundPayment }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({}) }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const cancel = (await import("@/app/api/shop/orders/[id]/cancel/route")).POST;

const ctx = { params: Promise.resolve({ id: "o1" }) };
const post = () => new Request("https://x.test/api/shop/orders/o1/cancel", { method: "POST" });
const order = () => h.db.orders[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.db = {
    orders: [
      {
        id: "o1",
        order_number: "MP-1",
        status: "delivered",
        paid_at: "2026-11-23T04:00:00.000Z",
        payment_method: "cash",
        payment_reference: null,
        stripe_session_id: null,
        currency: "SGD",
        total: 108,
        amount_captured: 108,
        amount_refunded: 0,
        shipped_at: null,
        delivered_at: "2026-11-23T04:00:00.000Z",
        refund_request_status: null,
      },
    ],
    order_items: [],
  };
});

describe("an order paid outside Stripe", () => {
  it("is not cancelled as if nobody had paid for it", async () => {
    const res = await cancel(post(), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Record refund");
    expect(order().status).toBe("delivered");
    expect(h.refundPayment).not.toHaveBeenCalled();
    expect(h.timeline).not.toHaveBeenCalled();
  });
});
