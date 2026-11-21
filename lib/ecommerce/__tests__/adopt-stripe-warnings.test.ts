import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  reprice: vi.fn(),
  tables: {} as Record<string, Row[]>,
  updateErrors: {} as Record<string, { message: string }>,
}));

vi.mock("@/lib/shop/price-sync", () => ({ repriceFromCostings: h.reprice }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const q = {
        op: "select",
        filters: [] as Array<[string, unknown]>,
        select: () => q,
        not: () => q,
        in: () => q,
        limit: () => q,
        single: () => q,
        insert: () => {
          q.op = "insert";
          return q;
        },
        update: () => {
          q.op = "update";
          return q;
        },
        eq(col: string, val: unknown) {
          q.filters.push([col, val]);
          return q;
        },
        then(resolve: (v: unknown) => void) {
          if (q.op === "update") return resolve({ data: null, error: h.updateErrors[table] ?? null });
          if (q.op === "insert") return resolve({ data: null, error: { message: "no inserts here" } });
          const rows = (h.tables[table] ?? []).filter((r) =>
            q.filters.every(([c, v]) => !(c in r) || r[c] === v),
          );
          const single = table === "products" && q.filters.some(([c]) => c === "slug" || c === "id");
          resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
        },
      };
      return q;
    },
  }),
}));

const { adoptManualProducts, syncAllProducts } = await import("@/lib/ecommerce/inventory-sync");

const warn = (product: string, message = "Couldn't sync to Stripe: boom") => [
  { product, message, next: `Open ${product} in Products and use Sync to Stripe to try again.` },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.updateErrors = {};
  h.reprice.mockImplementation(async (p: { name: string }) => warn(p.name));
  h.tables = {
    products: [
      {
        id: "p9",
        slug: "silk-cover",
        is_auto_generated: false,
        status: "draft",
        content: { "en-US": { title: "Silk Cover" } },
        product_variants: [{ id: "v9", item_id: null, sku: null, title: "Silk Cover", price_key: null }],
      },
    ],
    items: [{ id: 11, name: "Silk Cover", subtype: null, size: null, is_active: true }],
    item_prices: [{ item_id: 11, msrp: "40.00" }],
  };
});

describe("Sync from Inventory: adopting a manual product onto Costings prices", () => {
  it("carries the reprice's warnings out, named by the product's title", async () => {
    const result = await adoptManualProducts();
    expect(h.reprice).toHaveBeenCalledWith({ id: "p9", name: "Silk Cover" }, "Sync from Inventory");
    expect(result).toEqual({ adopted: 1, legacy: 0, stripeWarnings: warn("Silk Cover") });
  });

  it.each([
    ["product_variants", /Couldn't link its variant to Inventory.*: row locked/],
    ["products", /Couldn't switch it to Costings prices.*: row locked/],
  ])("reports a failed %s update instead of counting it adopted", async (table, message) => {
    h.updateErrors[table] = { message: "row locked" };
    const result = await adoptManualProducts();
    expect(h.reprice).not.toHaveBeenCalled();
    expect(result.adopted).toBe(0);
    expect(result.stripeWarnings).toEqual([
      { product: "Silk Cover", message: expect.stringMatching(message), next: "Try Sync from Inventory again." },
    ]);
  });
});

describe("syncAllProducts carries every reprice's warnings", () => {
  it("from the pillow, bolster, restored and adopted products", async () => {
    h.tables = {
      ...h.tables,
      pillow_products: [{ id: 1, size: "M", kind: "basic", is_active: true }],
      bolster_bom_lines: [{ variant: "short" }],
      product_variants: [{ id: "iv1", product_id: "p-arch", item_id: 21 }],
      products: [
        ...h.tables.products!,
        { id: "p-basic", slug: "mpillow-basic", content: { "en-US": { title: "Mpillow Basic" } } },
        { id: "p-bolster", slug: "mbolster", content: { "en-US": { title: "Mbolster" } } },
        { id: "p-arch", slug: "ear-pad", is_auto_generated: true, status: "archived", content: { "en-US": { title: "Ear Pad" } } },
      ],
      items: [...h.tables.items!, { id: 21, name: "Ear Pad", is_active: true }],
      item_prices: [...h.tables.item_prices!, { item_id: 21, msrp: "29.00" }],
    };

    const result = await syncAllProducts();
    expect(result.stripeWarnings.map((w) => w.product)).toEqual(["Mpillow Basic", "Mbolster", "Ear Pad", "Silk Cover"]);
  });
});
