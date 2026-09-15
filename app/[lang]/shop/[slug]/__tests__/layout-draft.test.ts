import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The PDP page 404s a draft or archived slug; the layout around it must not
 * still emit its title, description, image and Product JSON-LD (price).
 */

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

  it("gets not-found metadata", async () => {
    expect(await generateMetadata({ params, children: null })).toEqual({ title: "Product Not Found" });
    expect(h.buildPageMetadata).not.toHaveBeenCalled();
  });

  it("emits no Product JSON-LD", async () => {
    await ProductLayout({ params, children: null });
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
