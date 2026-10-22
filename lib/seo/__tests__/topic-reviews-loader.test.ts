import { describe, expect, it, vi } from "vitest";

// Next runs a fetch inside unstable_cache as no-store, so a Places read in that scope is
// billed on every refresh. The fake scope below tracks it the way Next does: per async call.
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return { scope: new AsyncLocalStorage<true>(), googleInsideCache: [] as boolean[] };
});

vi.mock("next/cache", () => ({
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A) =>
      h.scope.run(true, () => fn(...args)),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [
                {
                  title: null,
                  body: "My neck pain eased within a week.",
                  author_name: "Jun Tan",
                  rating: 5,
                  created_at: "2026-09-01",
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/google/places-reviews", () => ({
  getGooglePlaceTestimonials: async () => {
    h.googleInsideCache.push(h.scope.getStore() === true);
    return [{ quote: "The neck support is just right.", name: "Mei Lim", title: "Google review", rating: 5 }];
  },
}));

const { getTopicReviews } = await import("@/lib/seo/topic-reviews-loader");

describe("getTopicReviews", () => {
  it("reads Places outside unstable_cache, so the landing page's cached response is reused", async () => {
    const out = await getTopicReviews("neck-pain");

    expect(h.googleInsideCache).toEqual([false]);
    expect(out.map((r) => r.source).sort()).toEqual(["google", "store"]);
  });
});
