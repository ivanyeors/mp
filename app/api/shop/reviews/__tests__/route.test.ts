import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  after: vi.fn(),
  notify: vi.fn(),
  getAuthUser: vi.fn(),
  link: vi.fn(),
  requireAdmin: vi.fn(),
  tables: {} as Record<string, Row[]>,
  inserted: [] as Row[],
  writes: [] as { op: string; table: string }[],
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: h.after,
}));
vi.mock("@/lib/reviews/shop-reviews", () => ({ notifyNewShopReview: h.notify }));
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
          rows = [{ id: "r-inserted", ...row }];
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
const author = await import("@/app/api/shop/reviews/author/route");
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

  it("shows our reply and its time, but never the status, who wrote it, or the Telegram card", async () => {
    Object.assign(h.tables.product_reviews[0], {
      store_reply: "Thank you, Ada!",
      store_reply_at: "2026-09-02T00:00:00Z",
      store_reply_by_name: "Ivan",
      telegram_chat_id: -100,
      telegram_message_id: 7,
    });
    Object.assign(h.tables.product_reviews[1], { store_reply: "Thanks!", store_reply_at: "2026-09-02T00:00:00Z" });
    const res = await GET(new Request(`http://x/api/shop/reviews?product_id=${PRODUCT}`));
    const { rows } = await res.json();
    expect(rows).toEqual([
      expect.objectContaining({ id: "r-approved", store_reply: "Thank you, Ada!", store_reply_at: "2026-09-02T00:00:00Z" }),
    ]);
    for (const key of ["status", "store_reply_by_name", "telegram_chat_id", "telegram_message_id"]) {
      expect(rows[0]).not.toHaveProperty(key);
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
    expect(h.after).not.toHaveBeenCalled();
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

  it("posts a moderation card to Telegram after responding, not before", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({ product_id: PRODUCT, author_name: "Ada", rating: 5 });
    expect(res.status).toBe(201);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledOnce();
    await h.after.mock.calls[0][0]();
    expect(h.notify).toHaveBeenCalledWith("r-inserted");
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

  it("gives a Customer with no name the stand-in byline, whatever name the client sends", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    const res = await post({ product_id: PRODUCT, author_name: "Someone Famous", rating: 5 });
    expect(res.status).toBe(201);
    expect(h.inserted[0]).toMatchObject({ author_name: "mpillow customer" });
  });

  it("needs no author_name from the form any more", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    h.link.mockResolvedValue({ id: CUSTOMER, first_name: "Jane", last_name: null });
    const res = await post({ product_id: PRODUCT, rating: 4, title: "Comfy" });
    expect(res.status).toBe(201);
    expect(h.inserted[0]).toMatchObject({ author_name: "Jane", rating: 4, title: "Comfy" });
    expect(h.inserted[0]).not.toHaveProperty("store_reply");
  });
});

describe("GET /api/shop/reviews/author", () => {
  const read = async () => {
    const res = await author.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    return res.json();
  };

  it("says a visitor is signed out, without linking anything", async () => {
    expect(await read()).toEqual({ signedIn: false });
    expect(h.link).not.toHaveBeenCalled();
  });

  it("says an account with no email can't review, as the POST would", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-2", email: undefined });
    expect(await read()).toEqual({ signedIn: true, canReview: false, reason: "no_email" });
    expect(h.link).not.toHaveBeenCalled();
  });

  it("gives a signed-in Customer the byline the POST will store", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    h.link.mockResolvedValue({ id: CUSTOMER, first_name: "Jane", last_name: "Doe" });
    expect(await read()).toEqual({ signedIn: true, canReview: true, byline: "Jane D.", named: true });

    h.link.mockResolvedValue({ id: CUSTOMER, first_name: " ", last_name: "Doe" });
    expect(await read()).toEqual({ signedIn: true, canReview: true, byline: "mpillow customer", named: false });
  });

  it("reports a Customer it can't link as unavailable, not an error page", async () => {
    h.getAuthUser.mockResolvedValue({ id: "auth-1", email: "me@x.test" });
    h.link.mockRejectedValue(new Error("This email belongs to another account"));
    expect(await read()).toEqual({ signedIn: true, canReview: false, reason: "unavailable" });
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
