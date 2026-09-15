import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Storefront reviews: the GET is public, so it must force approved rows and a
 * public column list whatever the caller asks for; the POST takes the Customer
 * from the session and only accepts an order_id that Customer owns and that
 * contains the product.
 *
 * The Supabase mock is a tiny in-memory table store that applies eq filters and
 * flat column lists, so "only approved, no customer_id" is observed on the
 * response rather than inferred from the query. A table missing from the store
 * errors like prod does for `reviews`.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  link: vi.fn(),
  requireAdmin: vi.fn(),
  tables: {} as Record<string, Row[]>,
  inserted: [] as Row[],
  writes: [] as { op: string; table: string }[],
}));

vi.mock("@/lib/auth/user", () => ({ getAuthUser: h.getAuthUser }));
vi.mock("@/lib/auth/customer-identity", () => ({ linkCustomerToAuthUser: h.link }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const missing = !(table in h.tables);
      let rows = [...(h.tables[table] ?? [])];
      let cols: string | null = null;
      const project = (r: Row) =>
        !cols || cols === "*" || cols.includes("(")
          ? r
          : Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, r[c]]));
      const result = () =>
        missing
          ? { data: null, error: { message: `relation "${table}" does not exist` }, count: null }
          : { data: rows.map(project), error: null, count: rows.length };
      const b = {
        select: (c: string) => ((cols = c), b),
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), b),
        in: (k: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[k]))), b),
        then: (resolve: (v: unknown) => void) => resolve(result()),
        update: () => (h.writes.push({ op: "update", table }), b),
        delete: () => (h.writes.push({ op: "delete", table }), b),
        order: () => b,
        range: async () => result(),
        maybeSingle: async () => ({ ...result(), data: result().data?.[0] ?? null }),
        insert: (row: Row) => {
          h.inserted.push(row);
          rows = [row];
          return b;
        },
        single: async () => ({ ...result(), data: result().data?.[0] ?? null }),
      };
      return b;
    },
  }),
}));

const CUSTOMER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MY_ORDER = "11111111-1111-4111-8111-111111111111";
const THEIR_ORDER = "22222222-2222-4222-8222-222222222222";

const { GET, POST } = await import("@/app/api/shop/reviews/route");
const moderation = await import("@/app/api/shop/reviews/[id]/route");
const { getReviewAggregate, getReviewAggregates } = await import("@/lib/seo/review-aggregate");

const review = (status: string, extra: Row = {}): Row => ({
  id: `r-${status}`,
  product_id: PRODUCT,
  customer_id: OTHER,
  order_id: THEIR_ORDER,
  author_name: "Ada",
  rating: 5,
  title: "Great",
  body: "Soft",
  status,
  created_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const post = (body: unknown) =>
  POST(
    new Request("http://x/api/shop/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.inserted = [];
  h.writes = [];
  h.getAuthUser.mockResolvedValue(null);
  h.link.mockResolvedValue({ id: CUSTOMER, first_name: null, last_name: null });
  h.requireAdmin.mockResolvedValue(null);
  h.tables = {
    product_reviews: [review("approved"), review("pending"), review("rejected")],
    orders: [
      { id: MY_ORDER, customer_id: CUSTOMER, order_items: [{ product_variants: { product_id: PRODUCT } }] },
      { id: THEIR_ORDER, customer_id: OTHER, order_items: [{ product_variants: { product_id: PRODUCT } }] },
    ],
  };
});

describe("GET /api/shop/reviews", () => {
  it("ignores ?status=pending and returns only approved rows, without customer or order ids", async () => {
    const res = await GET(
      new Request(`http://x/api/shop/reviews?product_id=${PRODUCT}&status=pending`),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toMatchObject({ id: "r-approved", rating: 5, author_name: "Ada" });
    for (const row of json.rows) {
      expect(row).not.toHaveProperty("customer_id");
      expect(row).not.toHaveProperty("order_id");
    }
  });

  it("caps the page size", async () => {
    const res = await GET(new Request(`http://x/api/shop/reviews?product_id=${PRODUCT}&limit=5000`));
    expect((await res.json()).limit).toBe(100);
  });
});

describe("POST /api/shop/reviews", () => {
  it("refuses an anonymous caller", async () => {
    const res = await post({ product_id: PRODUCT, author_name: "Ada", rating: 5 });
    expect(res.status).toBe(401);
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses someone else's order_id", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({ product_id: PRODUCT, order_id: THEIR_ORDER, author_name: "Ada", rating: 5 });
    expect(res.status).toBe(403);
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses an owned order that does not contain the product", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({
      product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      order_id: MY_ORDER,
      author_name: "Ada",
      rating: 5,
    });
    expect(res.status).toBe(403);
  });

  it("takes customer_id from the session and starts the review pending", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({
      product_id: PRODUCT,
      order_id: MY_ORDER,
      customer_id: OTHER,
      status: "approved",
      author_name: "Ada",
      rating: 4,
    });
    expect(res.status).toBe(201);
    expect(h.inserted[0]).toMatchObject({ customer_id: CUSTOMER, order_id: MY_ORDER, status: "pending" });
  });

  it("caps the body length", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({ product_id: PRODUCT, author_name: "Ada", rating: 5, body: "x".repeat(5001) });
    expect(res.status).toBe(400);
  });
});

describe("reviews edge cases", () => {
  it("clamps a huge page instead of sending an unsafe offset", async () => {
    const res = await GET(
      new Request(`http://x/api/shop/reviews?product_id=${PRODUCT}&page=100000000000000000000`),
    );
    expect((await res.json()).page).toBe(1000);
  });

  it("does not echo database error text", async () => {
    delete h.tables.product_reviews;
    const res = await GET(new Request(`http://x/api/shop/reviews?product_id=${PRODUCT}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
  });

  it("answers 400, not a thrown 500, for a signed-in user with no email", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-2", email: undefined });
    h.link.mockRejectedValue(new Error("Cannot link a customer for an auth user without an email"));
    const res = await post({ product_id: PRODUCT, author_name: "Ada", rating: 5 });
    expect(res.status).toBe(400);
    expect(h.inserted).toHaveLength(0);
  });

  it("bylines the review from the Customer record, not the client", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    h.link.mockResolvedValue({ id: CUSTOMER, first_name: "Jane", last_name: "Doe" });
    const res = await post({ product_id: PRODUCT, author_name: "Someone Famous", rating: 5 });
    expect(res.status).toBe(201);
    expect(h.inserted[0]).toMatchObject({ author_name: "Jane D." });
  });
});

describe("siblings read product_reviews, not the missing reviews table", () => {
  const params = { params: Promise.resolve({ id: "r-pending" }) };

  it("moderation PATCH and DELETE are admin-gated and hit product_reviews", async () => {
    const patch = await moderation.PATCH(
      new Request("http://x/api/shop/reviews/r-pending", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
      }),
      params,
    );
    const del = await moderation.DELETE(new Request("http://x/api/shop/reviews/r-pending"), params);
    expect(h.requireAdmin).toHaveBeenCalledWith("products");
    expect([patch.status, del.status]).toEqual([200, 200]);
    expect(h.writes).toEqual([
      { op: "update", table: "product_reviews" },
      { op: "delete", table: "product_reviews" },
    ]);
  });

  it("the SEO aggregate counts approved reviews only", async () => {
    h.tables.product_reviews.push(review("approved", { id: "r-2", rating: 3 }));
    expect(await getReviewAggregate(PRODUCT)).toEqual({ average: 4, count: 2 });
    expect((await getReviewAggregates([PRODUCT]))[PRODUCT]).toEqual({ average: 4, count: 2 });
  });
});
