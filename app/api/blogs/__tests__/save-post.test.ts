import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stored: null as { slug: string; content: Record<string, unknown> } | null,
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
}));

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("@/lib/seo/indexnow", () => ({ blogPostUrls: () => [], pingIndexNow: vi.fn() }));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn(async () => {}) }));
vi.mock("@/lib/blogs", () => ({ listAdminBlogPosts: vi.fn(), getAdminBlogPostById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "new-id", ...row }, error: null }) }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.stored, error: null }) }) }),
      update: (row: Record<string, unknown>) => {
        h.updated.push(row);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "b1", ...h.stored, ...row }, error: null }) }) }) };
      },
    }),
  }),
}));

const { POST } = await import("@/app/api/blogs/route");
const { PATCH } = await import("@/app/api/blogs/[id]/route");

const english = { title: "Why your pillow matters", sub_header: "", description: "", body: "Text", seo_keywords: [] };
const untouchedTab = { title: "", sub_header: "", description: "", body: "", seo_keywords: [] };
const whatTheEditorSends = (over: Record<string, unknown> = {}) => ({
  slug: "why-your-pillow-matters",
  status: "published",
  author: "Mpillow",
  image_url: null,
  media_asset_id: null,
  labels: [],
  content: { "en-US": english, "zh-CN": untouchedTab },
  ...over,
});
const send = (method: string, body: unknown) =>
  new Request("http://x/api/blogs", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "b1" }) };

beforeEach(() => {
  h.stored = null;
  h.inserted.length = 0;
  h.updated.length = 0;
});

describe("saving a blog post", () => {
  it("publishes a new post whose 中文 tab was left empty", async () => {
    const res = await POST(send("POST", whatTheEditorSends()));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(Object.keys(h.inserted[0].content as object)).toEqual(["en-US"]);
    expect(h.inserted[0].published_at).toEqual(expect.any(String));
  });

  it("saves an existing post whose 中文 tab was left empty", async () => {
    h.stored = { slug: "why-your-pillow-matters", content: { "en-US": english } };
    const res = await PATCH(send("PATCH", whatTheEditorSends({ status: "draft" })), params);
    expect(res.status).toBe(200);
    expect(Object.keys(h.updated[0].content as object)).toEqual(["en-US"]);
  });

  it("answers a refused post with a sentence, never an object", async () => {
    const res = await POST(send("POST", whatTheEditorSends({ content: { "en-US": untouchedTab, "zh-CN": untouchedTab } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Add a title before saving.");
    expect(h.inserted).toEqual([]);

    const patched = await PATCH(send("PATCH", whatTheEditorSends({ author: 7 })), params);
    expect(typeof (await patched.json()).error).toBe("string");
  });

  it("refuses a title as the web address of a new or renamed post, and leaves an old address alone", async () => {
    const pasted = "Why Your Pillow Matters";
    expect((await POST(send("POST", whatTheEditorSends({ slug: pasted })))).status).toBe(400);

    h.stored = { slug: "why-your-pillow-matters", content: { "en-US": english } };
    expect((await PATCH(send("PATCH", whatTheEditorSends({ slug: pasted })), params)).status).toBe(400);
    expect(h.updated).toEqual([]);

    h.stored = { slug: "Old_Shopify_Handle", content: { "en-US": english } };
    expect((await PATCH(send("PATCH", whatTheEditorSends({ slug: "Old_Shopify_Handle" })), params)).status).toBe(200);
  });
});
