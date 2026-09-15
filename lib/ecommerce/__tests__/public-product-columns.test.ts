import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The storefront getters feed client components (ProductCard, ProductDetailClient)
 * so their selects are what reaches the browser.
 * They must list public columns instead of `product_variants(*)`, which carries
 * cost_price, Stripe/Shopify ids and inventory links.
 */

const h = vi.hoisted(() => ({ selects: [] as { table: string; columns: string }[] }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const b: Record<string, unknown> = {
        select: (columns: string) => (h.selects.push({ table, columns }), b),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 }),
        single: async () => ({
          data: table === "carts" ? { id: "cart-1" } : { product_variants: [], product_images: [], product_options: [] },
          error: null,
        }),
      };
      for (const m of ["eq", "not", "in", "gt", "order", "range", "limit", "overlaps", "or", "ilike"]) {
        b[m] = () => b;
      }
      return b;
    },
  }),
}));

const { getProducts, getProductBySlug, getFeaturedProducts } = await import("@/lib/ecommerce/products");

const INTERNAL = /cost_price|stripe_|shopify_|item_id|pillow_product_id|price_key|stock_quantity/;

beforeEach(() => {
  h.selects = [];
});

describe("storefront product selects", () => {
  it.each([
    ["getProducts", () => getProducts({ status: "active" })],
    ["getProductBySlug", () => getProductBySlug("mpillow-basic")],
    ["getFeaturedProducts", () => getFeaturedProducts(4)],
  ])("%s lists public product, variant and image columns", async (_name, run) => {
    await run();
    const { columns } = h.selects.find((s) => s.table === "products")!;
    expect(columns).not.toMatch(/^\s*\*/);
    expect(columns).not.toMatch(/product_variants\(\*|product_images\(\*/);
    expect(columns).toMatch(/product_variants\(id,/);
    expect(columns).not.toMatch(INTERNAL);
  });
});
