// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, PublicProductReview } from "@/lib/types/ecommerce";

import { settle } from "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/shop/mpillow-basic",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/shop/cart-context", () => ({ useCart: () => ({ addItem: () => undefined }) }));
vi.mock("@/lib/shop/currency-context", () => ({
  useCurrency: () => ({ currency: "SGD", convertFromBase: (n: number) => n }),
}));

const { ProductDetailClient } = await import("../product-detail-client");

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

const product = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "mpillow-basic",
  product_type: "pillow",
  status: "active",
  content: { "en-US": { title: "Mpillow Basic", description: "A pillow." } },
  category_id: null,
  featured: false,
  tags: [],
  images: [],
  variants: [
    {
      id: "v-basic",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Standard",
      price: 150,
      compare_at_price: null,
      currency: "SGD",
      track_inventory: false,
      is_active: true,
      position: 0,
      image_url: null,
    },
  ],
} as unknown as Product;

const reviews: PublicProductReview[] = [
  { id: "r1", rating: 5, title: "Sleeps cool", body: "Soft.", author_name: "Ada", created_at: "2026-10-01T00:00:00Z", store_reply: null, store_reply_at: null },
  { id: "r2", rating: 4, title: "Firm enough", body: null, author_name: "Ben", created_at: "2026-10-02T00:00:00Z", store_reply: null, store_reply_at: null },
];

let requested: string[] = [];
beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requested.push(String(url));
      if (String(url).startsWith("/api/shop/reviews?")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, rows: reviews }) });
      }
      return new Promise(() => {});
    }),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  window.location.hash = "";
  vi.unstubAllGlobals();
});

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props = { product, relatedProducts: [], lang: "en-US", reviews };
  await act(async () => root!.render(<ProductDetailClient {...props} />));
  await settle();
};

describe("Product page reviews", () => {
  it("shows the rating line and the approved reviews it was given", async () => {
    window.location.hash = "#reviews";
    await mount();

    expect(host.textContent).toContain("4.5 (2 reviews)");
    expect(host.textContent).toContain("Sleeps cool");
    expect(host.textContent).toContain("Based on 2 reviews");
  });

  it("asks the reviews API for nothing on mount", async () => {
    await mount();

    expect(requested.filter((url) => url.startsWith("/api/shop/reviews?"))).toEqual([]);
  });
});
