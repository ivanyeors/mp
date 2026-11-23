import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { permissionsForRole, type Permission } from "@/lib/auth/permissions";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

type Row = Record<string, unknown>;

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const h = vi.hoisted(() => ({ permissions: new Set<string>(), db: {} as FakeDb }));

vi.mock("@/lib/auth/admin", () => {
  const ctx = () => ({ userId: "u1", email: "ops@example.com", permissions: h.permissions });
  return {
    requireAdmin: vi.fn(async (permission: string) =>
      h.permissions.has(permission) ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    ),
    adminCanSeeCost: vi.fn(async () => h.permissions.has("costings")),
    requireAdminPage: vi.fn(async () => ctx()),
  };
});
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => ({
      ...fakeSupabaseAdmin(h.db),
      rpc: async () => ({ data: [{ revenue_sum: 210, revenue_count: 1 }], error: null }),
    }),
  };
});
vi.mock("@/lib/points/order", () => ({ readOrderPoints: async () => null }));
vi.mock("@/lib/staff-orders/link", () => ({ loadPayLinkRow: async () => null }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: ORDER_ID }),
  usePathname: () => "/en-US/settings/orders",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/[lang]/settings/orders/[id]/easyship-fulfilment", () => ({ EasyshipFulfilment: () => null }));
vi.mock("@/app/[lang]/settings/orders/[id]/refund-dialog", () => ({ RefundDialog: () => null }));
vi.mock("@/app/[lang]/settings/orders/[id]/payment-link-card", () => ({ PaymentLinkCard: () => null }));

const detailRoute = await import("@/app/api/shop/orders/[id]/route");
const listRoute = await import("@/app/api/shop/orders/route");
const dashboardRoute = await import("@/app/api/shop/orders/dashboard/route");
const { default: OrderDetailRoute } = await import("@/app/[lang]/settings/orders/[id]/page");
const { default: OrdersPage } = await import("@/app/[lang]/settings/orders/page");

const COST_KEYS = /"(unit_cost|total_cost|cogs|costPrice|gross_margin|margin_pct|total_gross_margin|avg_margin_pct)"/;

function seed() {
  h.db = {
    orders: [
      {
        id: ORDER_ID,
        order_number: "MP1001",
        status: "delivered",
        email: "buyer@example.com",
        currency: "SGD",
        subtotal: 200,
        shipping_amount: 10,
        discount_amount: 0,
        tax_amount: 0,
        total: 210,
        amount_refunded: 15,
        paid_at: "2026-11-01T02:00:00.000Z",
        created_at: "2026-11-01T01:00:00.000Z",
        shipping_address: { recipient: "Pat Tan", line1: "1 Example Road", city: "Singapore", postal_code: "000001", country: "SG" },
        order_items: [
          {
            id: "line-cover",
            order_id: ORDER_ID,
            sku: "COVER-M",
            product_title: "Silk cover",
            variant_title: "M",
            image_url: null,
            quantity: 2,
            returned_quantity: 0,
            unit_price: 50,
            total_price: 100,
            unit_cost: 12.5,
            total_cost: 25,
            kind: "goods",
            customization_snapshot: null,
            created_at: "2026-11-01T01:00:00.000Z",
          },
          {
            id: "line-result",
            order_id: ORDER_ID,
            sku: "RESULT-M-premium",
            product_title: "Custom Mpillow M premium",
            variant_title: "M · premium tier",
            image_url: null,
            quantity: 1,
            returned_quantity: 0,
            unit_price: 100,
            total_price: 100,
            unit_cost: 41,
            total_cost: 41,
            kind: "goods",
            customization_snapshot: {
              result_id: "result-1",
              product_type: "pillow",
              assigned_size: "M",
              assigned_tier: "premium",
              build_lines: [{ item_id: 7, quantity: 1, role: "composed", name: "Premium shell" }],
              preference_lines: [],
              addon_lines: [],
              cogs: 41,
              pricing: { goods: 100, services: 30, subtotal: 130, discount: 0, shipping: 0, tax: 0, total: 130 },
              service_lines: [{ key: "readjustment", label: "Re-adjustment", msrp: 30, costPrice: 8 }],
            },
            created_at: "2026-11-01T01:00:00.000Z",
          },
        ],
        order_timeline: [],
      },
    ],
    order_margins: [
      {
        order_id: ORDER_ID,
        order_number: "MP1001",
        revenue: 200,
        discount: 0,
        shipping: 10,
        tax: 0,
        cogs: 66,
        net_revenue: 195,
        gross_margin: 134,
        margin_pct: 67,
      },
    ],
    order_payments: [],
  };
}

const signInWith = (permissions: Iterable<Permission>) => {
  h.permissions = new Set(permissions);
};

const detailParams = { params: Promise.resolve({ id: ORDER_ID }) };
const pageParams = { params: Promise.resolve({ lang: "en-US", id: ORDER_ID }) };

async function api() {
  const detail = await (await detailRoute.GET(new Request("http://x"), detailParams)).json();
  const list = await (await listRoute.GET(new Request("http://x/api/shop/orders"))).json();
  const dashboard = await (await dashboardRoute.GET(new Request("http://x/api/shop/orders/dashboard"))).json();
  return { detail, list, dashboard };
}

async function pages() {
  const detail = (await OrderDetailRoute(pageParams)) as ReactElement<Row>;
  const list = (await OrdersPage({ params: Promise.resolve({ lang: "en-US" }) })) as ReactElement<Row>;
  return { detail, list, detailHtml: renderToString(detail), listHtml: renderToString(list) };
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe.each([
  ["Staff", permissionsForRole("staff")],
  ["Viewer", permissionsForRole("viewer")],
])("a role with orders but not costings (%s)", (_role, permissions) => {
  beforeEach(() => signInWith(permissions));

  it("gets no cost at sale, COGS or margin from the order detail, list and dashboard APIs", async () => {
    const { detail, list, dashboard } = await api();
    for (const json of [detail, list, dashboard]) expect(JSON.stringify(json)).not.toMatch(COST_KEYS);
    expect(detail.margin).toBeNull();
    expect(list.rows[0]).not.toHaveProperty("margin");
    expect(dashboard.stats).not.toHaveProperty("total_gross_margin");
    expect(dashboard.stats).not.toHaveProperty("avg_margin_pct");
  });

  it("still gets prices paid, quantities, totals, refunds and revenue", async () => {
    const { detail, list, dashboard } = await api();
    const [cover, result] = detail.row.items as Row[];
    expect(cover).toMatchObject({ quantity: 2, unit_price: 50, total_price: 100 });
    expect(result.customization_snapshot).toMatchObject({
      result_id: "result-1",
      build_lines: [{ item_id: 7, quantity: 1, role: "composed", name: "Premium shell" }],
      pricing: { goods: 100, subtotal: 130 },
      service_lines: [{ key: "readjustment", msrp: 30 }],
    });
    expect(detail.row).toMatchObject({ total: 210, subtotal: 200, amount_refunded: 15 });
    expect(list.rows[0]).toMatchObject({ order_number: "MP1001", total: 210, items_count: 3 });
    expect(dashboard.stats).toMatchObject({ total_orders: 1, revenue: 210, avg_order_value: 210 });
  });

  it("the order page and Orders page get no cost, and show no cost, COGS or margin", async () => {
    const { detail, list, detailHtml, listHtml } = await pages();
    expect(JSON.stringify(detail.props.initialData)).not.toMatch(COST_KEYS);
    expect(JSON.stringify(list.props.initialData)).not.toMatch(COST_KEYS);
    expect(list.props.canSeeCost).toBe(false);

    expect(detailHtml).toContain("Silk cover");
    expect(detailHtml).toContain("Unit price");
    expect(detailHtml).not.toContain("Unit cost");
    expect(detailHtml).not.toContain("Realized margin");
    expect(detailHtml).not.toContain("COGS");
    expect(detailHtml).not.toContain("Gross margin");

    expect(listHtml).toContain("Revenue");
    expect(listHtml).not.toContain("Gross margin");
    expect(listHtml).not.toContain(">Margin<");
  });
});

describe("a role with orders and costings (Manager) keeps today's behaviour", () => {
  beforeEach(() => signInWith(permissionsForRole("manager")));

  it("gets cost at sale, COGS and margin from the APIs", async () => {
    const { detail, list, dashboard } = await api();
    const [cover, result] = detail.row.items as Row[];
    expect(cover).toMatchObject({ unit_cost: 12.5, total_cost: 25 });
    expect(result.customization_snapshot).toMatchObject({ cogs: 41, service_lines: [{ costPrice: 8 }] });
    expect(detail.margin).toMatchObject({ cogs: 66, gross_margin: 134, margin_pct: 67 });
    expect(list.rows[0].margin).toEqual({ gross_margin: 134, margin_pct: 67 });
    expect(dashboard.stats).toMatchObject({ total_gross_margin: 134, avg_margin_pct: 67 });
  });

  it("the order page and Orders page show unit cost, COGS and margin", async () => {
    const { list, detailHtml, listHtml } = await pages();
    expect(list.props.canSeeCost).toBe(true);
    expect(detailHtml).toContain("Unit cost");
    expect(detailHtml).toContain("Realized margin");
    expect(detailHtml).toContain("COGS");
    expect(detailHtml).toContain("Gross margin");
    expect(listHtml).toContain("Gross margin");
    expect(listHtml).toContain(">Margin<");
  });
});
