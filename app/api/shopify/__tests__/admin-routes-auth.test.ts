import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Guard contract for the six Shopify admin routes. The POSTs take the sync
 * token or an `inventory` Staff session and must fail closed when
 * SHOPIFY_SYNC_TOKEN is unset; the GETs take the session only. Calls the real
 * handlers with a real Request and mocks only the Shopify/Supabase work behind
 * the guard, so a refused caller is also proven not to reach it.
 */

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  syncInventory: vi.fn(),
  upsertProduct: vi.fn(),
  listProducts: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/shopify/sync", () => ({ syncShopifyInventoryFromBuildable: h.syncInventory }));
vi.mock("@/lib/shopify/pricing", () => ({ syncShopifyPricingFromSupabase: vi.fn() }));
vi.mock("@/lib/shopify/products", () => ({
  shopifyUpsertCanonicalProduct: h.upsertProduct,
  shopifyListActiveProductsWithVariants: h.listProducts,
}));
vi.mock("@/lib/shopify/client", () => ({ shopifyGetPrimaryLocationId: vi.fn() }));
vi.mock("@/lib/shopify/order-mirror-ingest", () => ({ reResolveShopifyLineCosts: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({ from: () => ({ upsert: h.upsert }) }),
}));

const { POST: syncPost } = await import("@/app/api/shopify/sync/route");
const { POST: catalogPost } = await import("@/app/api/shopify/catalog/sync/route");
const { POST: applyPost } = await import("@/app/api/shopify/mapping/apply/route");
const { GET: variantsGet } = await import("@/app/api/shopify/variants/route");
const { GET: diagnosticsGet } = await import("@/app/api/shopify/diagnostics/route");
const { GET: suggestGet } = await import("@/app/api/shopify/mapping/suggest/route");

const TOKEN = "sync-token-123";
const validApply = { rows: [{ shopify_variant_id: 42, kind: "pillow", pillow_size: "M" }] };

function post(path: string, opts: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request(`https://x.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? validApply),
  }) as never;
}

const posts = [
  { path: "/api/shopify/sync", handler: syncPost, work: () => h.syncInventory },
  { path: "/api/shopify/catalog/sync", handler: catalogPost, work: () => h.upsertProduct },
  { path: "/api/shopify/mapping/apply", handler: applyPost, work: () => h.upsert },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Shopify is otherwise configured: only the sync token is missing.
  vi.stubEnv("SHOPIFY_SHOP_DOMAIN", "shop.myshopify.com");
  vi.stubEnv("SHOPIFY_ADMIN_ACCESS_TOKEN", "shpat_x");
  vi.stubEnv("SHOPIFY_SYNC_TOKEN", "");
  h.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.syncInventory.mockResolvedValue({ updated: 0 });
  h.upsertProduct.mockResolvedValue({ id: 1, title: "t", variants: [] });
  h.listProducts.mockResolvedValue([]);
  h.upsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(posts)("POST $path", ({ path, handler, work }) => {
  it("refuses no token and no session when SHOPIFY_SYNC_TOKEN is unset", async () => {
    const res = await handler(post(path));
    expect(res.status).toBe(401);
    expect(work()).not.toHaveBeenCalled();
  });

  it("refuses a wrong token without a session", async () => {
    vi.stubEnv("SHOPIFY_SYNC_TOKEN", TOKEN);
    const res = await handler(post(path, { token: "nope" }));
    expect(res.status).toBe(401);
    expect(work()).not.toHaveBeenCalled();
  });

  it("does not let an empty bearer match an unset token", async () => {
    const res = await handler(post(path, { token: " " }));
    expect(res.status).toBe(401);
  });

  it("serves the valid token without consulting the session", async () => {
    vi.stubEnv("SHOPIFY_SYNC_TOKEN", TOKEN);
    const res = await handler(post(path, { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(work()).toHaveBeenCalled();
    expect(h.requireAdmin).not.toHaveBeenCalled();
  });

  it("serves an inventory Staff session", async () => {
    h.requireAdmin.mockResolvedValue(null);
    const res = await handler(post(path));
    expect(res.status).toBe(200);
    expect(h.requireAdmin).toHaveBeenCalledWith("inventory");
    expect(work()).toHaveBeenCalled();
  });
});

describe("POST /api/shopify/mapping/apply body", () => {
  beforeEach(() => h.requireAdmin.mockResolvedValue(null));

  it.each([
    ["not JSON", "{"],
    ["no rows", {}],
    ["empty rows", { rows: [] }],
    ["unknown kind", { rows: [{ shopify_variant_id: 1, kind: "part", item_id: 3 }] }],
    ["bad pillow size", { rows: [{ shopify_variant_id: 1, kind: "pillow", pillow_size: "XXL" }] }],
    ["string variant id", { rows: [{ shopify_variant_id: "1", kind: "bolster", bolster_variant: "short" }] }],
  ])("returns 400 for %s without upserting", async (_label, body) => {
    const req = new Request("https://x.test/api/shopify/mapping/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const res = await applyPost(req as never);
    expect(res.status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("upserts a valid pillow + bolster body", async () => {
    const res = await applyPost(
      post("/api/shopify/mapping/apply", {
        body: {
          rows: [
            { shopify_variant_id: 42, kind: "pillow", pillow_size: "M" },
            { shopify_variant_id: 43, kind: "bolster", bolster_variant: "long" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledWith(
      [
        { shopify_variant_id: 42, kind: "pillow", pillow_size: "M", bolster_variant: null, item_id: null },
        { shopify_variant_id: 43, kind: "bolster", pillow_size: null, bolster_variant: "long", item_id: null },
      ],
      { onConflict: "shopify_variant_id" },
    );
  });
});

describe.each([
  { path: "/api/shopify/variants", call: () => variantsGet(new Request("https://x.test/api/shopify/variants") as never) },
  { path: "/api/shopify/diagnostics", call: () => diagnosticsGet() },
  { path: "/api/shopify/mapping/suggest", call: () => suggestGet(new Request("https://x.test/api/shopify/mapping/suggest") as never) },
])("GET $path", ({ call }) => {
  it("refuses a caller without a Staff session", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.requireAdmin).toHaveBeenCalledWith("inventory");
    expect(h.listProducts).not.toHaveBeenCalled();
  });

  it("refuses Staff without the inventory permission", async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await call();
    expect(res.status).toBe(403);
  });
});
