import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { roleHasPermission, type AdminRole } from "@/lib/auth/permissions";

const h = vi.hoisted(() => ({
  role: null as AdminRole | null,
  from: vi.fn(),
  listAdminProducts: vi.fn(),
  getAdminProduct: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async (permission: Parameters<typeof roleHasPermission>[1]) => {
    if (!h.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return roleHasPermission(h.role, permission)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }),
  adminCanSeeCost: vi.fn(async () => (h.role ? roleHasPermission(h.role, "costings") : false)),
}));
vi.mock("@/lib/ecommerce/admin/products", () => ({
  listAdminProducts: h.listAdminProducts,
  getAdminProduct: h.getAdminProduct,
}));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: (t: string) => (h.from(t), b),
      select: () => b,
      eq: () => b,
      order: async () => ({ data: [], error: null }),
    };
    return b;
  },
}));

const { GET: listGet } = await import("@/app/api/shop/products/route");
const { GET: productGet } = await import("@/app/api/shop/products/[id]/route");
const { GET: variantsGet } = await import("@/app/api/shop/products/[id]/variants/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.role = null;
  h.listAdminProducts.mockResolvedValue({ ok: true, rows: [], total: 0, page: 1, limit: 20 });
  h.getAdminProduct.mockResolvedValue({ ok: true, row: { id: ID } });
});

describe("GET /api/shop/products", () => {
  it("refuses an anonymous caller asking for drafts, before reading", async () => {
    const res = await listGet(new Request("http://x/api/shop/products?status=draft"));
    expect([401, 403]).toContain(res.status);
    expect(h.listAdminProducts).not.toHaveBeenCalled();
  });

  it("refuses a Staff role without the products permission", async () => {
    h.role = "staff";
    const res = await listGet(new Request("http://x/api/shop/products?status=draft"));
    expect(res.status).toBe(403);
    expect(h.listAdminProducts).not.toHaveBeenCalled();
  });

  it("serves a Staff session holding products", async () => {
    h.role = "manager";
    const res = await listGet(new Request("http://x/api/shop/products?status=draft"));
    expect(res.status).toBe(200);
    expect(h.listAdminProducts).toHaveBeenCalledOnce();
  });
});

describe("GET /api/shop/products/[id]", () => {
  it("refuses an anonymous caller", async () => {
    const res = await productGet(new Request(`http://x/api/shop/products/${ID}`), params);
    expect([401, 403]).toContain(res.status);
    expect(h.getAdminProduct).not.toHaveBeenCalled();
  });
});

describe("GET /api/shop/products/[id]/variants", () => {
  it("refuses an anonymous caller, before reading variants", async () => {
    const res = await variantsGet(new Request(`http://x/api/shop/products/${ID}/variants`), params);
    expect([401, 403]).toContain(res.status);
    expect(h.from).not.toHaveBeenCalled();
  });

  it("serves a Staff session holding products", async () => {
    h.role = "manager";
    const res = await variantsGet(new Request(`http://x/api/shop/products/${ID}/variants`), params);
    expect(res.status).toBe(200);
    expect(h.from).toHaveBeenCalledWith("product_variants");
  });
});
