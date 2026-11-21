import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  product: null as Record<string, unknown> | null,
  buildPageMetadata: vi.fn((m: { title: string }) => ({ title: m.title })),
  buildProductJsonLd: vi.fn(() => ({})),
}));

vi.mock("@/lib/ecommerce/products", () => ({
  getProductBySlug: async () => h.product,
  resolveProductContent: () => ({ title: "Secret launch", description: "Unreleased" }),
  getProductPriceRange: () => ({ min: 1, max: 1, currency: "SGD" }),
}));
vi.mock("@/lib/seo", () => ({
  buildPageMetadata: h.buildPageMetadata,
  buildProductJsonLd: h.buildProductJsonLd,
  buildProductBreadcrumbJsonLd: () => ({}),
  buildFaqPageJsonLd: () => ({}),
  getReviewAggregate: async () => ({ average: 0, count: 0 }),
}));
vi.mock("@/lib/page-faq", () => ({
  getPageFaq: async () => null,
  productSurfaceKey: (id: string) => id,
  stripMarkdownForSchema: (s: string) => s,
}));
vi.mock("@/components/seo/json-ld-script", () => ({ JsonLdScript: () => null }));

const { default: ProductLayout, generateMetadata } = await import("@/app/[lang]/shop/[slug]/layout");

const params = Promise.resolve({ lang: "en-US", slug: "secret-launch" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(["draft", "archived"])("a %s product", (status) => {
  beforeEach(() => {
    h.product = { id: "p1", slug: "secret-launch", status, images: [], variants: [] };
  });

  it("gets not-found metadata, without the shop's canonical and hreflang", async () => {
    expect(await generateMetadata({ params, children: null })).toEqual({ title: "Product Not Found", alternates: null });
    expect(h.buildPageMetadata).not.toHaveBeenCalled();
  });

  it("answers 404 itself, before the page streams, and emits no Product JSON-LD", async () => {
    await expect(ProductLayout({ params, children: null })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(h.buildProductJsonLd).not.toHaveBeenCalled();
  });
});

it("an active product still gets metadata and JSON-LD", async () => {
  h.product = { id: "p1", slug: "secret-launch", status: "active", images: [], variants: [] };
  await generateMetadata({ params, children: null });
  await ProductLayout({ params, children: null });
  expect(h.buildPageMetadata).toHaveBeenCalledOnce();
  expect(h.buildProductJsonLd).toHaveBeenCalledOnce();
});
