import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ price: vi.fn() }));

vi.mock("@/lib/shop/price-sync", () => ({ syncVariantPricesFromCostings: h.price }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const rows: Record<string, unknown[]> = {
        products: [
          {
            id: "p9",
            slug: "silk-cover",
            content: { "en-US": { title: "Silk Cover" } },
            product_variants: [{ id: "v9", item_id: null, sku: null, title: "Silk Cover", price_key: null }],
          },
        ],
        items: [{ id: 11, name: "Silk Cover", subtype: null, size: null, is_active: true }],
        item_prices: [{ item_id: 11, msrp: "40.00" }],
      };
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        update: () => q,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? null, error: null }),
      };
      return q;
    },
  }),
}));

const { adoptManualProducts } = await import("@/lib/ecommerce/inventory-sync");

beforeEach(() => vi.clearAllMocks());

describe("Sync from Inventory adopting a manual product onto Costings prices", () => {
  it("carries a failed Stripe sync out, named by the product's title", async () => {
    h.price.mockResolvedValue({ productId: "p9", synced: 1, unresolvable: [], problems: ["Couldn't sync to Stripe: boom"] });
    const result = await adoptManualProducts();
    expect(h.price).toHaveBeenCalledWith("p9");
    expect(result).toEqual({
      adopted: 1,
      legacy: 0,
      stripeWarnings: [{ product: "Silk Cover", message: "Couldn't sync to Stripe: boom" }],
    });
  });

  it("carries a thrown repricing error out instead of dropping it", async () => {
    h.price.mockRejectedValue(new Error("db down"));
    const result = await adoptManualProducts();
    expect(result.stripeWarnings).toEqual([{ product: "Silk Cover", message: "db down" }]);
  });

  it("has no warnings when the repricing went through", async () => {
    h.price.mockResolvedValue({ productId: "p9", synced: 1, unresolvable: [], problems: [] });
    expect((await adoptManualProducts()).stripeWarnings).toEqual([]);
  });
});
