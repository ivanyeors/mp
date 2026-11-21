import { beforeEach, describe, expect, it, vi } from "vitest";

const RMA = "0c0c0c0c-0000-4000-8000-000000000001";
const ORDER = "0c0c0c0c-0000-4000-8000-0000000000aa";

const h = vi.hoisted(() => ({
  rma: {} as Record<string, unknown>,
  refundPayment: vi.fn(),
  timeline: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ assertAdmin: async () => ({ userId: "staff-1" }) }));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refundPayment }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let columns = "";
      const b: Record<string, unknown> = {
        select: (c: string) => ((columns = c), b),
        eq: () => b,
        maybeSingle: async () => ({ data: table === "rma_requests" ? onlySelected(h.rma, columns) : null, error: null }),
      };
      return b;
    },
  }),
}));

function onlySelected(rma: Record<string, unknown>, columns: string) {
  const orderColumns = /orders\(([^()]*)/.exec(columns)?.[1].split(",").map((c) => c.trim()) ?? [];
  const order = rma.orders as Record<string, unknown> | null;
  if (!order) return rma;
  const kept = Object.fromEntries(Object.entries(order).filter(([k]) => k === "order_items" || orderColumns.includes(k)));
  return { ...rma, orders: kept };
}

const { issueRmaRefund } = await import("@/app/[lang]/settings/rma/actions");

type RefundArgs = { paymentIntentId: string; amount?: number; idempotencyKey: string };
const stripeCall = () => h.refundPayment.mock.calls[0][0] as RefundArgs;

function twoPillowsTwentyOff(returned: Array<{ order_item_id: string; quantity: number }>) {
  return {
    id: RMA,
    status: "received",
    resolution: "refund",
    orders: {
      id: ORDER,
      payment_reference: "pi_rma",
      subtotal: 200,
      shipping_amount: 8,
      points_discount: 0,
      total: 168,
      amount_captured: 168,
      amount_refunded: 0,
      currency: "SGD",
      order_items: [
        { id: "line-a", quantity: 1, total_price: 100, unit_price: 100 },
        { id: "line-b", quantity: 1, total_price: 100, unit_price: 100 },
      ],
    },
    rma_request_items: returned.map((r) => ({ ...r, order_items: { unit_price: 100 } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.refundPayment.mockImplementation(async () => ({ id: "re_1" }));
});

describe("issueRmaRefund — what Stripe is asked for", () => {
  it("returning one of two S$100.00 lines on a 20%-off Order asks Stripe for S$80.00", async () => {
    h.rma = twoPillowsTwentyOff([{ order_item_id: "line-a", quantity: 1 }]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 80 });
    expect(h.refundPayment).toHaveBeenCalledTimes(1);
    expect(stripeCall()).toMatchObject({ paymentIntentId: "pi_rma", amount: 80, idempotencyKey: `rma_refund_${RMA}` });
    expect(h.timeline.mock.calls[0][3]).toMatchObject({ amount: 80 });
    expect(h.audit.mock.calls[0][0]).toMatchObject({ after: { amount: 80 } });
  });

  it("returning both lines refunds S$160.00 and keeps the S$8.00 shipping", async () => {
    h.rma = twoPillowsTwentyOff([
      { order_item_id: "line-a", quantity: 1 },
      { order_item_id: "line-b", quantity: 1 },
    ]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 160 });
    expect(stripeCall().amount).toBe(160);
  });

  it("on an Order paid S$50 in points, returning one line asks Stripe for its S$100.00: the points stay spent on the kept line", async () => {
    h.rma = twoPillowsTwentyOff([{ order_item_id: "line-a", quantity: 1 }]);
    Object.assign(h.rma.orders as Record<string, unknown>, { points_discount: 50, total: 158, amount_captured: 158 });
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall().amount).toBe(100);
  });

  it("is capped at what is left, and then sends no amount so Stripe refunds the rest", async () => {
    h.rma = twoPillowsTwentyOff([{ order_item_id: "line-a", quantity: 1 }]);
    (h.rma.orders as Record<string, unknown>).amount_refunded = 100;
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 68 });
    expect(stripeCall().amount).toBeUndefined();
  });

  it("still refuses a return that has not been received", async () => {
    h.rma = { ...twoPillowsTwentyOff([{ order_item_id: "line-a", quantity: 1 }]), status: "approved" };
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Mark the return received");
    expect(h.refundPayment).not.toHaveBeenCalled();
  });
});
