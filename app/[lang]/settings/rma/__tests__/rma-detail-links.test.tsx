import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Permission } from "@/lib/auth/permissions";

const h = vi.hoisted(() => ({ permissions: new Set<string>() }));

const RMA = {
  id: "r1",
  status: "requested",
  resolution: "refund",
  reason: "too_firm",
  customer_note: null,
  admin_note: null,
  photo_urls: [],
  tracking_number: null,
  tracking_url: null,
  created_at: "2026-10-20T04:00:00Z",
  orders: { id: "o-123", order_number: 1042 },
  customers: { id: "c-456", email: "mei@example.com" },
};

const rowsFor: Record<string, unknown> = { rma_requests: RMA, rma_request_items: [], rma_status_events: [] };
function chain(table: string) {
  const data = rowsFor[table];
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
  };
  return q;
}

vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async () => ({ permissions: h.permissions, email: "owner@mpillow.com" })),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({ from: chain }) }));
vi.mock("../actions", () => ({
  saveAdminNoteForm: vi.fn(),
  approveRmaForm: vi.fn(),
  rejectRmaForm: vi.fn(),
  sendInstructionsForm: vi.fn(),
  markReceivedForm: vi.fn(),
  completeReturnForm: vi.fn(),
  issueRmaRefundForm: vi.fn(),
}));

const { default: RmaDetailPage } = await import("../[id]/page");

const render = async (...keys: Permission[]) => {
  h.permissions = new Set(["returns", ...keys]);
  return renderToString(await RmaDetailPage({ params: Promise.resolve({ lang: "en-US", id: "r1" }) }));
};

beforeEach(() => {
  h.permissions = new Set();
});

describe("Return detail hand-offs", () => {
  it("links the Customer and the Order for a role holding both", async () => {
    const html = await render("customers", "orders");
    expect(html).toContain('href="/en-US/settings/customers/c-456"');
    expect(html).toContain('href="/en-US/settings/orders/o-123"');
    expect(html).toContain("mei@example.com");
  });

  it("links only what the role can open", async () => {
    const ordersOnly = await render("orders");
    expect(ordersOnly).not.toContain("/settings/customers/");
    expect(ordersOnly).toContain('href="/en-US/settings/orders/o-123"');

    const customersOnly = await render("customers");
    expect(customersOnly).toContain('href="/en-US/settings/customers/c-456"');
    expect(customersOnly).not.toContain("/settings/orders/o-123");
  });

  it("keeps the email and order number as plain text without either key", async () => {
    const html = await render();
    expect(html).toContain("mei@example.com");
    expect(html).toContain("1042");
    expect(html).not.toContain("/settings/customers/");
    expect(html).not.toContain("/settings/orders/o-123");
  });
});
