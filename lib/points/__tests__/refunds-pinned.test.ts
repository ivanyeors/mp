import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORDER = "0b0b0b0b-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  rmaItems: [] as Array<{ order_item_id: string; quantity: number }>,
  tables: [] as string[],
  writes: [] as string[],
  refundPayment: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: async () => ({ userId: "staff-1" }),
  requireAdmin: async () => null,
  getAdminContext: async () => ({ userId: "staff-1" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refundPayment }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      h.tables.push(table);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        update: () => (h.writes.push(`update:${table}`), b),
        insert: () => (h.writes.push(`insert:${table}`), b),
        upsert: () => (h.writes.push(`upsert:${table}`), b),
        delete: () => (h.writes.push(`delete:${table}`), b),
        maybeSingle: async () => ({
          data:
            table === "rma_requests"
              ? { id: "rma", status: "received", resolution: "refund", orders: h.order, rma_request_items: h.rmaItems }
              : null,
          error: null,
        }),
        single: async () => ({ data: table === "orders" ? { ...h.order, items: [] } : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return b;
    },
    rpc: async (fn: string) => {
      h.writes.push(`rpc:${fn}`);
      return { data: null, error: null };
    },
  }),
}));

const { issueRmaRefund } = await import("@/app/[lang]/settings/rma/actions");
const { POST: adminRefund } = await import("@/app/api/shop/orders/[id]/refund/route");

beforeEach(() => {
  vi.clearAllMocks();
  h.tables = [];
  h.writes = [];
  h.refundPayment.mockResolvedValue({ id: "re_1" });
  h.order = {
    id: ORDER,
    order_number: "MP-PTS",
    payment_reference: "pi_points",
    currency: "SGD",
    status: "delivered",
    subtotal: 100,
    shipping_amount: 0,
    discount_amount: 20,
    points_spent: 2000,
    points_discount: 20,
    total: 80,
    amount_captured: 80,
    amount_refunded: 0,
    shipped_at: null,
    delivered_at: null,
    refund_request_status: null,
    self_purchase_units: 0,
    coupons: null,
    order_items: [
      { id: "line-1", quantity: 1, total_price: 50, unit_price: 50, kind: "goods", customization_snapshot: null },
      { id: "line-2", quantity: 1, total_price: 50, unit_price: 50, kind: "goods", customization_snapshot: null },
    ],
  };
});

const fullRefund = () =>
  new Request(`https://x.test/api/shop/orders/${ORDER}/refund`, {
    method: "POST",
    body: JSON.stringify({
      request_id: "0b0b0b0b-2000-4000-8000-000000000001",
      mode: "full",
      reason: "charged_in_error",
    }),
  });

const settle = (amount: number) => {
  h.order.amount_refunded = Number(h.order.amount_refunded) + amount;
};
const refundedAmountArg = (call: number) => (h.refundPayment.mock.calls[call][0] as { amount?: number }).amount;

describe("refunds with points used (rule l)", () => {
  it("returning one item through an RMA refunds its S$50 in cash", async () => {
    h.rmaItems = [{ order_item_id: "line-1", quantity: 1 }];
    expect(await issueRmaRefund("rma-1")).toEqual({ ok: true, amount: 50 });
    expect(refundedAmountArg(0)).toBe(50);
  });

  it("returning the other then refunds the S$30 of cash left: the points stay spent", async () => {
    h.rmaItems = [{ order_item_id: "line-1", quantity: 1 }];
    await issueRmaRefund("rma-1");
    settle(50);
    h.rmaItems = [{ order_item_id: "line-2", quantity: 1 }];
    expect(await issueRmaRefund("rma-2")).toEqual({ ok: true, amount: 30 });
    expect(refundedAmountArg(1)).toBeUndefined();
    settle(30);
    await expect(issueRmaRefund("rma-3")).rejects.toThrow("Nothing left to refund on this order.");
  });

  it("a full refund returns the S$80 paid, not the S$100 the items cost", async () => {
    const res = await adminRefund(fullRefund(), { params: Promise.resolve({ id: ORDER }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, amount: 80 });
    expect(refundedAmountArg(0)).toBeUndefined();
  });

  it("no refund writes a points entry, or calls a points function", async () => {
    h.rmaItems = [
      { order_item_id: "line-1", quantity: 1 },
      { order_item_id: "line-2", quantity: 1 },
    ];
    await issueRmaRefund("rma-1");
    await adminRefund(fullRefund(), { params: Promise.resolve({ id: ORDER }) });
    expect(h.tables).not.toContain("points_ledger");
    expect(h.writes.filter((w) => w.startsWith("rpc:"))).toEqual([]);

    for (const file of [
      "lib/ecommerce/admin-refund.ts",
      "lib/rma/refund.ts",
      "app/[lang]/settings/rma/actions.ts",
      "app/api/shop/orders/[id]/refund/route.ts",
    ]) {
      expect(readFileSync(join(process.cwd(), file), "utf8"), file).not.toMatch(/points_ledger|release_points|spend_release|releasePoints/);
    }
  });
});
