import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("@/lib/stripe/sync", () => ({
  syncProductToStripeSafe: vi.fn(async () => ({
    synced: true,
    pricesInPlace: true,
    notices: [],
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      update: (row: unknown) => (h.update(row), b),
      select: () => b,
      eq: () => b,
      single: async () => ({
        data: { id: "v1", product_id: "p1", price: 0, is_active: true, is_auto_generated: false },
        error: null,
      }),
    };
    return b;
  },
}));

const { PATCH } = await import("@/app/api/shop/products/[id]/variants/[variantId]/route");

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/shop/products/[id]/variants/[variantId]", () => {
  it("never writes a Stripe Price id the browser sends, in either mode", async () => {
    const body = { title: "M", stripe_price_id: "price_evil", stripe_price_id_test: "price_evil" };
    const res = await PATCH(
      new Request("http://x/api/shop/products/p1/variants/v1", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "p1", variantId: "v1" }) },
    );
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    const saved = h.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.title).toBe("M");
    expect(Object.keys(saved).filter((k) => k.startsWith("stripe_"))).toEqual([]);
  });
});
