import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { loadSalesReport } = await import("@/lib/analytics/sales-report");

const NOVEMBER = { from: "2026-11-01T00:00:00+08:00", to: "2026-12-01T00:00:00+08:00" };
const AT = "2026-11-23T04:00:00.000Z";

const sale = (id: string, revenue: number) => ({
  order: { id, paid_at: AT },
  margin: { order_id: id, cogs: 10, gross_margin: revenue - 10 },
  item: { id: `line-${id}`, order_id: id, kind: "service", service_key: "readjustment", product_title: "Re-adjustment service", quantity: 1, total_price: revenue, unit_cost: 10, total_cost: 10, returned_quantity: 0 },
});

beforeEach(() => {
  const sales = [sale("by-stripe", 30), sale("in-cash", 50), sale("unexplained", 70)];
  h.db = {
    orders: sales.map((s) => s.order),
    order_margins: sales.map((s) => s.margin),
    order_items: sales.map((s) => s.item),
    order_payments: [
      { id: "p1", order_id: "by-stripe", type: "charge", occurred_at: AT, stripe_object_id: "pi_1", metadata: {} },
      { id: "p2", order_id: "in-cash", type: "charge", occurred_at: AT, stripe_object_id: null, metadata: { source: "outside_stripe", method: "cash" } },
      { id: "p3", order_id: "unexplained", type: "charge", occurred_at: AT, stripe_object_id: null, metadata: {} },
    ],
    product_variants: [],
    pillow_products: [],
    items: [],
  };
});

describe("which Orders the sales report counts as sold", () => {
  it("counts one Stripe charged and one Staff marked paid outside Stripe, not a charge nobody can explain", async () => {
    const report = await loadSalesReport(NOVEMBER);
    expect(report.summary).toMatchObject({ orderCount: 2, revenue: 80 });
  });

  it("dates a sale paid outside Stripe by when Staff marked it", async () => {
    h.db.order_payments[1].occurred_at = "2026-10-31T15:59:59.000Z";
    const report = await loadSalesReport(NOVEMBER);
    expect(report.summary).toMatchObject({ orderCount: 1, revenue: 30 });
  });
});
