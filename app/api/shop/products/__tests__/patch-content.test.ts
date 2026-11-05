import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving the product editor writes each language's words whole, so a field
 * the save's schema doesn't name is erased. The answer lede (`seo_answer`)
 * was one: every Save took it off the product page. It is kept now.
 */

const h = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: vi.fn(async () => ({ synced: true })) }));
vi.mock("@/lib/seo/indexnow", () => ({ pingIndexNow: vi.fn(), productUrls: vi.fn(() => []) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      update: (row: unknown) => (h.update(row), b),
      select: () => b,
      eq: () => b,
      single: async () => ({ data: { id: "p1", slug: "slope-mattress", status: "draft" }, error: null }),
    };
    return b;
  },
}));

const { PATCH } = await import("@/app/api/shop/products/[id]/route");

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/shop/products/[id]", () => {
  it("saves each language's answer lede with the rest of its words", async () => {
    const content = {
      "en-US": { title: "Slope Mattress", seo_title: "Slope Mattress", seo_answer: "The Slope Mattress is a foam wedge." },
      "zh-CN": { title: "斜坡床垫", seo_answer: "斜坡床垫是一块泡沫斜坡垫。" },
    };
    const res = await PATCH(
      new Request("http://x/api/shop/products/p1", { method: "PATCH", body: JSON.stringify({ content }), headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const saved = h.update.mock.calls[0]![0] as { content: Record<string, { seo_answer: string }> };
    expect(saved.content["en-US"]!.seo_answer).toBe("The Slope Mattress is a foam wedge.");
    expect(saved.content["zh-CN"]!.seo_answer).toBe("斜坡床垫是一块泡沫斜坡垫。");
  });
});
