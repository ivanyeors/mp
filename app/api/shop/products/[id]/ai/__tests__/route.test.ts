import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClaude, userMessage, type FakeAnswer } from "@/lib/ai/__tests__/fake-claude";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * The product editor's ✨ route: `products` first, then the request, the AI
 * writing settings read at the call, Claude's credentials and the per-Staff
 * limits, then the product's own details and Claude. It returns words to
 * offer and writes one thing, its audit entry: never the product.
 */

type Row = Record<string, unknown>;

const PRODUCT_ID = "00000000-0000-4000-8000-00000000a001";

const h = vi.hoisted(() => ({
  permissions: new Set<string>(["products"]),
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as string[],
  hits: new Map<string, number>(),
  claude: null as unknown,
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "member-1", userId: "u1", email: "staff@example.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));

/** The service-role client: reads from `h.tables`, counts `rate_limit_hit`, and records every write. */
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = [...(h.tables[table] ?? [])];
      const write = () => {
        h.writes.push(table);
        return Promise.resolve({ data: null, error: null });
      };
      const q = {
        select: () => q,
        in: (col: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[col]));
          return q;
        },
        eq: (col: string, value: unknown) => {
          rows = rows.filter((r) => r[col] === value);
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, fail),
        insert: write,
        update: write,
        upsert: write,
        delete: write,
      };
      return q;
    },
    async rpc(name: string, args: Row) {
      if (name !== "rate_limit_hit") throw new Error(`fake: no rpc ${name}`);
      const key = `${args.p_bucket}:${args.p_key}`;
      const n = (h.hits.get(key) ?? 0) + 1;
      h.hits.set(key, n);
      return { data: n > Number(args.p_max), error: null };
    },
  }),
}));
vi.mock("@/lib/ai/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/claude")>()),
  claudeClient: () => h.claude,
}));

const { POST } = await import("../route");

function useClaude(answers: FakeAnswer[]) {
  const fake = fakeClaude(answers);
  h.claude = fake.client;
  return fake;
}

const CONTENT = { "en-US": { title: "Slope Mattress", description: "A foam wedge.", body: "The Slope Mattress sits under your pillow." } };
const SEO_ASK = { kind: "seo", locale: "en-US", keyphrase: "", content: CONTENT };

const post = (body: unknown, id = PRODUCT_ID) =>
  POST(new Request(`http://x/api/shop/products/${id}/ai`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), {
    params: Promise.resolve({ id }),
  });

const GOOD_SEO = {
  seoTitle: "Slope Mattress: Foam Pillow Wedge",
  seoDescription: "A foam wedge that sits under your pillow and gently raises your head and shoulders. Washable cover, and it works with any Mpillow. Shop online.",
  seoAnswer: `The Slope Mattress is a foam wedge from Mpillow that sits under your pillow. ${Array.from({ length: 65 }, () => "comfortable").join(" ")}.`,
  notes: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.permissions = new Set(["products"]);
  h.writes = [];
  h.hits = new Map();
  h.tables = {
    site_settings: [],
    products: [
      {
        id: PRODUCT_ID,
        product_type: "accessory",
        tags: ["material:Polyurethane foam"],
        category_id: "cat-1",
        product_options: [],
        product_variants: [{ title: "Default", is_active: true, position: 0, price: 137.5 }],
      },
    ],
    categories: [{ id: "cat-1", slug: "accessories", content: { "en-US": { name: "Accessories" } } }],
  };
  h.claude = null;
});

describe("POST /api/shop/products/[id]/ai", () => {
  it("needs the products permission", async () => {
    h.permissions = new Set(["campaigns"]);
    useClaude([{ text: JSON.stringify(GOOD_SEO) }]);
    expect((await post(SEO_ASK)).status).toBe(403);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("returns Claude's SEO and writes nothing but its audit entry", async () => {
    const fake = useClaude([{ text: JSON.stringify(GOOD_SEO), usage: { input_tokens: 1200, output_tokens: 400 } }]);
    const res = await post(SEO_ASK);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: "seo", locale: "en-US", seoTitle: GOOD_SEO.seoTitle });
    // The category's name reached Claude; the price never did.
    expect(userMessage(fake.calls[0]!)).toContain("Accessories");
    expect(userMessage(fake.calls[0]!)).not.toContain("137");
    expect(h.writes).toEqual([]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![0]).toMatchObject({
      action: "product.ai_seo",
      entityType: "product",
      entityId: PRODUCT_ID,
      after: { kind: "product_seo", input_tokens: 1200, output_tokens: 400, ended: "suggested", attempts: 1, locale: "en-US", keyphrase: false },
    });
  });

  it("refuses an ask with nothing to work from before Claude is asked", async () => {
    const fake = useClaude([{ text: "{}" }]);
    const res = await post({ kind: "description", locale: "en-US", mode: "improve", parts: "both", length: "short", content: { "en-US": { title: "Slope Mattress" } } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nothing written here/);
    expect(fake.calls).toHaveLength(0);
  });

  it("says AI writing is off when the owner switched it off", async () => {
    h.tables.site_settings = [{ key: "ai_writing_enabled", value: "false" }];
    const fake = useClaude([{ text: JSON.stringify(GOOD_SEO) }]);
    const res = await post(SEO_ASK);
    expect(res.status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("is a 404 for a product that isn't there", async () => {
    useClaude([{ text: JSON.stringify(GOOD_SEO) }]);
    expect((await post(SEO_ASK, "00000000-0000-4000-8000-00000000ffff")).status).toBe(404);
  });

  it("is a 502 with the reason when Claude's words don't fit, audited as failed", async () => {
    useClaude([{ text: JSON.stringify({ ...GOOD_SEO, seoAnswer: "Relieves neck pain overnight." }) }]);
    const res = await post(SEO_ASK);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/^Claude's SEO didn't fit/);
    expect(h.audit.mock.calls[0]![0]).toMatchObject({ after: { ended: "failed", attempts: 2 } });
  });
});
