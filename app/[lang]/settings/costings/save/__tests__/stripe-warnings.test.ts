import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  variantReadError: null as { message: string } | null,
  variantUpdateError: null as { message: string } | null,
  variantUpdates: [] as Array<{ id: unknown; values: Row }>,
  stripe: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue({ userId: "u1", email: "ops@example.com" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/shopify/order-mirror-ingest", () => ({ reResolveShopifyLineCosts: vi.fn() }));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: h.stripe }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const q = {
        op: "select" as "select" | "update" | "upsert" | "delete",
        values: null as Row | null,
        filters: [] as Array<[string, unknown]>,
        select: () => q,
        not: () => q,
        in: () => q,
        eq(col: string, val: unknown) {
          q.filters.push([col, val]);
          return q;
        },
        upsert() {
          q.op = "upsert";
          return q;
        },
        delete() {
          q.op = "delete";
          return q;
        },
        update(values: Row) {
          q.op = "update";
          q.values = values;
          return q;
        },
        then(resolve: (v: unknown) => void) {
          if (table === "product_variants" && q.op === "update") {
            h.variantUpdates.push({ id: q.filters.find(([c]) => c === "id")?.[1], values: q.values! });
            return resolve({ data: null, error: h.variantUpdateError });
          }
          if (q.op !== "select") return resolve({ data: null, error: null });
          if (table === "product_variants" && h.variantReadError) {
            return resolve({ data: null, error: h.variantReadError });
          }
          const rows = (h.tables[table] ?? []).filter((r) =>
            q.filters.every(([c, v]) => !(c in r) || r[c] === v),
          );
          resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  }),
}));

const { POST: saveCostings } = await import("@/app/[lang]/settings/costings/save/route");
const { POST: resyncPrices } = await import("@/app/api/shop/products/resync-prices/route");

const save = async () => {
  const res = await saveCostings(
    new Request("https://x.test/en-US/settings/costings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ itemId: 7, costPriceCents: 500, msrpCents: 2900 }] }),
    }),
  );
  return { status: res.status, body: await res.json() };
};

const resync = async () => {
  const res = await resyncPrices();
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.variantReadError = null;
  h.variantUpdateError = null;
  h.variantUpdates = [];
  h.stripe.mockResolvedValue({ synced: true, result: {} });
  h.tables = {
    products: [
      {
        id: "p1",
        slug: "ear-pad",
        is_auto_generated: true,
        content: { "en-US": { title: "Ear Pad" }, "zh-CN": { title: "耳垫" } },
      },
    ],
    product_variants: [
      {
        id: "v1",
        product_id: "p1",
        title: "Size S",
        sku: "EP-S",
        item_id: 7,
        pillow_product_id: null,
        option1: null,
        price_key: "item:7",
      },
    ],
    item_prices: [{ item_id: 7, cost_price: "5.00", msrp: "29.00", compare_at_price: null }],
  };
});

describe.each([
  ["Costings save", save],
  ["Resync prices", resync],
])("%s: a price that does not reach Stripe", (_name, run) => {
  it("still answers ok, and names the product with Stripe's own message", async () => {
    h.stripe.mockResolvedValue({ synced: false, error: "Rate limit exceeded (req_123)" });
    const { status, body } = await run();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(h.variantUpdates).toEqual([{ id: "v1", values: expect.objectContaining({ price: 29 }) }]);
    expect(h.stripe).toHaveBeenCalledWith("p1");
    expect(body.stripe_warnings).toEqual([
      { product: "Ear Pad", message: expect.stringContaining("Rate limit exceeded (req_123)") },
    ]);
    expect(body.stripe_warnings[0].message).toMatch(/Stripe/);
  });

  it("reports a Variant price that could not be written, by the Variant's name", async () => {
    h.variantUpdateError = { message: "permission denied for table product_variants" };
    const { status, body } = await run();

    expect(status).toBe(200);
    expect(body.stripe_warnings).toEqual([
      {
        product: "Ear Pad",
        message: expect.stringMatching(/Size S.*permission denied for table product_variants/),
      },
    ]);
  });

  it("reports a failed Variant read", async () => {
    h.variantReadError = { message: "connection reset" };
    const { body } = await run();

    expect(body.stripe_warnings).toEqual([
      { product: "Ear Pad", message: expect.stringContaining("connection reset") },
    ]);
  });

  it("names a product with no title by its slug", async () => {
    h.tables.products[0]!.content = {};
    h.stripe.mockResolvedValue({ synced: false, error: "boom" });
    const { body } = await run();

    expect(body.stripe_warnings).toEqual([{ product: "ear-pad", message: expect.stringContaining("boom") }]);
  });

  it("has no warning key when everything synced", async () => {
    const { body } = await run();

    expect(body.ok).toBe(true);
    expect(h.stripe).toHaveBeenCalledWith("p1");
    expect(body).not.toHaveProperty("stripe_warnings");
  });
});
