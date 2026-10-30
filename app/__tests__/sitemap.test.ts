import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getProducts: vi.fn(), getBlogPostsFromDb: vi.fn() }));
vi.mock("@/lib/ecommerce/products", () => ({ getProducts: h.getProducts }));
vi.mock("@/lib/blogs", () => ({ getBlogPostsFromDb: h.getBlogPostsFromDb }));

import sitemap from "@/app/sitemap";

const ORIGIN = "https://custom.mpillow.com";

describe("sitemap", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
    h.getProducts.mockResolvedValue({ products: [{ slug: "satin-white-cover", updated_at: "2026-10-01" }], total: 1 });
    h.getBlogPostsFromDb.mockResolvedValue([
      { slug: "english-only", locales: ["en-US"], content_updated_at: null, published_at: "2026-09-01" },
    ]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("lists each locale of a page as its own URL, naming every locale and x-default", async () => {
    const shop = (await sitemap()).filter((e) => e.url.endsWith("/shop"));
    expect(shop.map((e) => e.url)).toEqual([`${ORIGIN}/en-US/shop`, `${ORIGIN}/zh-CN/shop`]);
    for (const e of shop) {
      expect(e.alternates?.languages).toEqual({
        "en-US": `${ORIGIN}/en-US/shop`,
        "zh-CN": `${ORIGIN}/zh-CN/shop`,
        "x-default": `${ORIGIN}/en-US/shop`,
      });
    }
  });

  it("lists English-only pages and untranslated posts in English alone", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of ["/privacy-policy", "/points", "/support", "/blog/english-only"]) {
      expect(urls).toContain(`${ORIGIN}/en-US${path}`);
      expect(urls).not.toContain(`${ORIGIN}/zh-CN${path}`);
    }
  });

  it("lists shop products in every locale, and leaves the legacy builder out", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/en-US/shop/satin-white-cover`);
    expect(urls).toContain(`${ORIGIN}/zh-CN/shop/satin-white-cover`);
    expect(urls.some((u) => u.includes("/mp-maker"))).toBe(false);
  });
});
