import { describe, it, expect, vi, beforeEach } from "vitest";

// Stripe client mock: an existing product is updated (no create/price calls).
const productsUpdate = vi.fn(async () => ({ id: "prod_x" }));
vi.mock("../client", () => ({
  getStripe: () => ({
    products: { update: productsUpdate, create: vi.fn() },
    prices: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
  }),
}));

// Supabase mock: returns a single active product with no variants.
const product = {
  id: "p1",
  slug: "x",
  content: { "en-US": { title: "X" } },
  stripe_product_id: "prod_x",
  product_variants: [],
  product_images: [],
};
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: product }) }) }),
      update: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

const { syncProductToStripeSafe } = await import("../sync");

beforeEach(() => {
  productsUpdate.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProductToStripeSafe", () => {
  it("returns synced:true with the sync result on success", async () => {
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(true);
    expect(out.result?.stripe_product_id).toBe("prod_x");
    expect(out.result?.variants).toEqual([]);
  });

  it("swallows errors and returns synced:false (never throws)", async () => {
    productsUpdate.mockRejectedValueOnce(new Error("boom"));
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(false);
    expect(out.error).toBe("boom");
  });
});
