import { describe, it, expect, vi, beforeEach } from "vitest";

const productsUpdate = vi.fn(async () => ({ id: "prod_x" }));
const productsCreate = vi.fn(async () => ({ id: "prod_fresh" }));
vi.mock("../client", () => ({
  getStripe: () => ({
    products: { update: productsUpdate, create: productsCreate },
    prices: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
  }),
}));

const product: {
  id: string;
  slug: string;
  content: Record<string, { title: string }>;
  stripe_product_id: string | null;
  stripe_product_id_test: string | null;
  product_variants: unknown[];
  product_images: unknown[];
} = {
  id: "p1",
  slug: "x",
  content: { "en-US": { title: "X" } },
  stripe_product_id: "prod_live_x",
  stripe_product_id_test: "prod_x",
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
  productsCreate.mockClear();
  product.stripe_product_id_test = "prod_x";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProductToStripeSafe", () => {
  it("returns synced:true with the sync result on success", async () => {
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(true);
    expect(out.result?.stripeProductId).toBe("prod_x");
    expect(out.result?.variants).toEqual([]);
  });

  it("touches this account's product, not the one beside it", async () => {
    await syncProductToStripeSafe("p1");
    expect(productsUpdate).toHaveBeenCalledWith("prod_x", expect.anything());
    expect(productsCreate).not.toHaveBeenCalled();
  });

  it("creates fresh rather than reusing the other account's id", async () => {
    product.stripe_product_id_test = null;
    const out = await syncProductToStripeSafe("p1");
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(productsCreate).toHaveBeenCalled();
    expect(out.result?.stripeProductId).toBe("prod_fresh");
  });

  it("swallows errors and returns synced:false (never throws)", async () => {
    productsUpdate.mockRejectedValueOnce(new Error("boom"));
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(false);
    expect(out.error).toBe("boom");
  });
});
