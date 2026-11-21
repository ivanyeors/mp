import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  reprice: vi.fn(),
  tables: {} as Record<string, Row[]>,
  updateErrors: {} as Record<string, { message: string }>,
  readErrors: {} as Record<string, { message: string }>,
  updates: [] as Array<{ table: string; values: Row; filters: Array<[string, unknown]> }>,
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
        values: null as Row | null,
        update: (values: Row) => {
          q.op = "update";
          q.values = values;
          return q;
        },
        eq(col: string, val: unknown) {
          q.filters.push([col, val]);
          return q;
        },
        then(resolve: (v: unknown) => void) {
          if (q.op === "update") {
            h.updates.push({ table, values: q.values!, filters: q.filters });
            return resolve({ data: null, error: h.updateErrors[table] ?? null });
          }
          if (h.readErrors[table]) return resolve({ data: null, error: h.readErrors[table] });
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

const { adoptManualProducts, archiveUnsellableItemProducts, syncAllProducts } = await import("@/lib/ecommerce/inventory-sync");

const warn = (product: string, message = "Couldn't sync to Stripe: boom") => [
  { product, message, next: `Open ${product} in Products and use Sync to Stripe to try again.` },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.updateErrors = {};
  h.readErrors = {};
  h.updates = [];
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
    expect(h.reprice).toHaveBeenCalledWith({ id: "p9", name: "Silk Cover" });
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
      { product: "Silk Cover", message: expect.stringMatching(message), next: "Run Sync from Inventory again." },
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

describe("Sync from Inventory: archiving and restoring item products", () => {
  beforeEach(() => {
    h.tables = {
      product_variants: [
        { id: "iv1", product_id: "p-live", item_id: 21 },
        { id: "iv2", product_id: "p-arch", item_id: 22 },
      ],
      products: [
        { id: "p-live", slug: "ear-pad", is_auto_generated: true, status: "active", content: { "en-US": { title: "Ear Pad" } } },
        { id: "p-arch", slug: "neck-roll", is_auto_generated: true, status: "archived", content: { "en-US": { title: "Neck Roll" } } },
      ],
      items: [
        { id: 21, is_active: true },
        { id: 22, is_active: true },
      ],
      item_prices: [{ item_id: 22, msrp: "19.00" }],
    };
  });

  it("archives the unsellable one and restores the sellable one when the reads work", async () => {
    const result = await archiveUnsellableItemProducts();
    expect(result.archived).toBe(1);
    expect(h.updates.map((u) => [u.filters.find(([c]) => c === "id")?.[1], u.values.status])).toEqual([
      ["p-live", "archived"],
      ["p-arch", "draft"],
    ]);
    expect(h.reprice).toHaveBeenCalledWith({ id: "p-arch", name: "Neck Roll" });
  });

  it.each(["items", "item_prices"])(
    "archives and restores nothing when the %s read fails, and says to run Sync from Inventory again",
    async (table) => {
      h.readErrors[table] = { message: "statement timeout" };
      const result = await archiveUnsellableItemProducts();
      expect(h.updates).toEqual([]);
      expect(h.reprice).not.toHaveBeenCalled();
      expect(result).toEqual({
        archived: 0,
        stripeWarnings: [
          {
            message: `Couldn't read ${table} (statement timeout), so no shop product was archived or restored`,
            next: "Run Sync from Inventory again.",
          },
        ],
      });
    },
  );

  it("reports a failed archive update instead of dropping it", async () => {
    h.tables.products = h.tables.products!.filter((p) => p.id === "p-live");
    h.updateErrors.products = { message: "row locked" };
    const result = await archiveUnsellableItemProducts();
    expect(result).toEqual({
      archived: 0,
      stripeWarnings: [
        {
          product: "Ear Pad",
          message: expect.stringMatching(/Couldn't take it out of the shop.*: row locked/),
          next: "Run Sync from Inventory again.",
        },
      ],
    });
  });
});
