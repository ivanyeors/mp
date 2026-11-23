import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  ledgerFails: false,
  cancelLabel: vi.fn(),
  decrement: vi.fn(async () => undefined),
  stats: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleLabelCancel: h.cancelLabel, scheduleAutoLabel: vi.fn() }));
vi.mock("@/lib/ecommerce/discounts", () => ({ decrementCouponUsage: h.decrement }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: h.stats }));
vi.mock("@/lib/ecommerce/money-ledger", async (orig) => {
  const real = await orig<typeof import("@/lib/ecommerce/money-ledger")>();
  return {
    ...real,
    recordLedgerEntry: async (...args: Parameters<typeof real.recordLedgerEntry>) => {
      if (h.ledgerFails) throw new Error("ledger is down");
      return real.recordLedgerEntry(...args);
    },
  };
});

const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
const { recordOutsideRefund, RecordRefundSchema } = await import("@/lib/ecommerce/outside-refund");

const NOW = new Date("2026-11-24T02:00:00Z");
const STAFF = { email: "staff@mpillow.test" };
const admin = () => fakeSupabaseAdmin(h.db) as never;
const order = () => h.db.orders[0];
const refunds = () => h.db.order_payments.filter((p) => p.type === "refund");
const record = (amount: number, note = "Handed back in cash at the studio") =>
  recordOutsideRefund(admin(), "o1", { amount, note }, STAFF, NOW);

beforeEach(() => {
  vi.clearAllMocks();
  h.ledgerFails = false;
  h.db = {
    orders: [
      {
        id: "o1",
        status: "confirmed",
        paid_at: "2026-11-23T04:00:00.000Z",
        payment_method: "cash",
        payment_reference: null,
        currency: "SGD",
        total: 108,
        amount_captured: 108,
        amount_refunded: 0,
        coupon_id: "coupon-1",
        customer_id: "c1",
      },
    ],
    order_payments: [
      { id: "p1", order_id: "o1", type: "charge", amount: 108, stripe_object_id: null, metadata: { source: "outside_stripe", method: "cash" } },
    ],
    order_timeline: [],
  };
});

describe("recording a refund on an order paid outside Stripe", () => {
  it("records part of it: the ledger, the order's totals and the timeline agree, and the order stays open", async () => {
    expect(await record(30)).toEqual({ ok: true, amount: 30, fullyRefunded: false });
    expect(refunds()).toEqual([
      expect.objectContaining({
        amount: -30,
        stripe_object_id: null,
        occurred_at: NOW.toISOString(),
        metadata: expect.objectContaining({ source: "outside_stripe", method: "cash", recorded_by: STAFF.email }),
      }),
    ]);
    expect(order()).toMatchObject({ amount_refunded: 30, amount_captured: 108, status: "partially_refunded" });
    expect(h.db.order_timeline.map((t) => t.event_type)).toEqual(["partially_refunded"]);
    expect(String(h.db.order_timeline[0].message)).toContain("No money moved through Stripe");
    expect(h.decrement).not.toHaveBeenCalled();
    expect(h.cancelLabel).not.toHaveBeenCalled();
  });

  it("closes the order once everything is returned: its coupon use and label are given back", async () => {
    await record(30);
    expect(await record(78)).toEqual({ ok: true, amount: 78, fullyRefunded: true });
    expect(order()).toMatchObject({ amount_refunded: 108, status: "refunded" });
    expect(h.decrement).toHaveBeenCalledWith("coupon-1");
    expect(h.cancelLabel).toHaveBeenCalledTimes(1);
    expect(h.stats).toHaveBeenCalledWith("c1");
    expect(await record(1)).toMatchObject({ ok: false, status: 400 });
    expect(refunds()).toHaveLength(2);
  });

  it("refuses more than was paid", async () => {
    expect(await record(108.01)).toEqual({ ok: false, status: 400, error: "Record between 0.01 and 108.00 SGD." });
    expect(refunds()).toEqual([]);
    expect(order().amount_refunded).toBe(0);
  });

  it("refuses an order Stripe was paid for: that one goes back through Stripe", async () => {
    Object.assign(order(), { payment_method: "stripe", payment_reference: "pi_1" });
    expect(await record(30)).toMatchObject({ ok: false, status: 400 });
    expect(refunds()).toEqual([]);
  });

  it("puts the order's refunded total back when the refund cannot be recorded", async () => {
    h.ledgerFails = true;
    expect(await record(30)).toMatchObject({ ok: false, status: 500 });
    expect(order()).toMatchObject({ amount_refunded: 0, status: "confirmed" });
  });

  it("needs an amount and a note saying how the money went back", () => {
    expect(RecordRefundSchema.safeParse({ amount: 30 }).success).toBe(false);
    expect(RecordRefundSchema.safeParse({ amount: 30, note: "  " }).success).toBe(false);
    expect(RecordRefundSchema.safeParse({ amount: 0, note: "cash" }).success).toBe(false);
    expect(RecordRefundSchema.safeParse({ amount: 30, note: "cash" }).success).toBe(true);
  });
});
