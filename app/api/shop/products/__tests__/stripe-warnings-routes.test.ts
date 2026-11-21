import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  reprice: vi.fn(),
  syncAll: vi.fn(),
  push: vi.fn(),
  product: null as Row | null,
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(null),
  requireAnyAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue({ userId: "u1", email: "ops@example.com" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/shop/price-sync", () => ({ repriceFromCostings: h.reprice }));
vi.mock("@/lib/ecommerce/inventory-sync", () => ({ syncAllProducts: h.syncAll }));
vi.mock("@/lib/ecommerce/shop-listings", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/shop-listings")>()),
  pushFamilyToProducts: h.push,
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from() {
      const q = {
        op: "select",
        select: () => q,
        eq: () => q,
        update: () => {
          q.op = "update";
          return q;
        },
        maybeSingle: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve(q.op === "update" ? { data: null, error: null } : { data: h.product, error: null }),
      };
      return q;
    },
  }),
}));

const { POST: syncInventory } = await import("@/app/api/shop/products/sync-inventory/route");
const { PATCH: setListed } = await import("@/app/api/shop/products/listings/route");
const { POST: pushFromInventory } = await import("@/app/api/shop/products/from-inventory/route");

const warning = {
  product: "Ear Pad",
  message: "Couldn't sync to Stripe, so customers may still be charged the old price: boom",
  next: "Open Ear Pad in Products and use Sync to Stripe to try again.",
};

const counts = {
  pillows: { created: 0, updated: 1 },
  bolsters: { created: 0, updated: 1 },
  items: { archived: 0, adopted: 0, legacy: 0 },
};

const listed = () =>
  setListed(
    new Request("https://x.test/api/shop/products/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: "p1", listed: true }),
    }),
  );

const pushed = () =>
  pushFromInventory(
    new Request("https://x.test/api/shop/products/from-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: [7], prices: [{ item_id: 7, cost_cents: 500, msrp_cents: 2900 }] }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.product = {
    id: "p1",
    slug: "ear-pad",
    status: "draft",
    product_type: "accessory",
    is_auto_generated: true,
    category_id: null,
    published_at: null,
    content: { "en-US": { title: "Ear Pad" } },
    product_variants: [{ id: "v1", price: 29, is_active: true }],
    product_images: [],
  };
});

describe("Sync from Inventory", () => {
  it("answers stripe_warnings beside its message", async () => {
    h.syncAll.mockResolvedValue({ ...counts, stripeWarnings: [warning] });
    const body = await (await syncInventory()).json();
    expect(body).toMatchObject({ ok: true, message: "Synced: 0 created, 2 updated", stripe_warnings: [warning] });
  });

  it("has no warning key when all went through", async () => {
    h.syncAll.mockResolvedValue({ ...counts, stripeWarnings: [] });
    expect(await (await syncInventory()).json()).not.toHaveProperty("stripe_warnings");
  });
});

describe("In the shop switch", () => {
  it("reprices the product from Costings and answers its warnings", async () => {
    h.reprice.mockResolvedValue([warning]);
    const res = await listed();
    expect(res.status).toBe(200);
    expect(h.reprice).toHaveBeenCalledWith({ id: "p1", name: "Ear Pad" }, "the In the shop switch");
    expect(await res.json()).toEqual({ ok: true, listed: true, title: "Ear Pad", stripe_warnings: [warning] });
  });

  it("has no warning key when the reprice went through", async () => {
    h.reprice.mockResolvedValue([]);
    expect(await (await listed()).json()).toEqual({ ok: true, listed: true, title: "Ear Pad" });
  });
});

describe("Add from Inventory push", () => {
  const result = {
    ok: true,
    productId: "p1",
    slug: "ear-pad",
    title: "Ear Pad",
    created: false,
    added: 1,
    productStatus: "active",
  };

  it("answers stripe_warnings beside the push result", async () => {
    h.push.mockResolvedValue({ ...result, stripeWarnings: [warning] });
    expect(await (await pushed()).json()).toEqual({ ...result, stripe_warnings: [warning] });
  });

  it("has no warning key when the reprice went through", async () => {
    h.push.mockResolvedValue({ ...result, stripeWarnings: [] });
    expect(await (await pushed()).json()).toEqual(result);
  });
});
