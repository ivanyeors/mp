import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

/**
 * The shop card's price and an email's products block's price
 * (PRD-campaign-email-editor slice 07) are one rule, `shopCardPrice`: the
 * cheapest active Variant's price, *From* when it has more than one, and its
 * compare-at struck through only when it is above it.
 */

vi.mock("@/lib/shop/cart-context", () => ({ useCart: () => ({ addItem: () => undefined }) }));
vi.mock("@/lib/shop/currency-context", () => ({ useCurrency: () => ({ currency: "SGD", convertFromBase: (n: number) => n }) }));

const { ProductCard } = await import("../product-card");
const { shopProductCard } = await import("@/lib/email-campaigns/products");

const variant = (id: string, price: number, over: Partial<ProductVariant> = {}) =>
  ({ id, price, compare_at_price: null, currency: "SGD", is_active: true, position: 0, stock_available: 5, ...over }) as ProductVariant;
const product = (variants: ProductVariant[]) =>
  ({
    id: "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    slug: "fibrecool-cover",
    product_type: "accessory",
    status: "active",
    content: { "en-US": { title: "FibreCool Cover" } },
    variants,
    images: [],
  }) as unknown as Product;

/** The card's price line, as it reads. */
const cardPrice = (variants: ProductVariant[]) => {
  const html = renderToStaticMarkup(<ProductCard product={product(variants)} />);
  const words = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return words.slice(words.indexOf("FibreCool Cover") + "FibreCool Cover".length).trim();
};
/** The email's, for the same product. */
const emailPrice = (variants: ProductVariant[]) =>
  shopProductCard({ ...product(variants), product_variants: variants, product_images: [] } as never).price;

describe("a product's price, on the shop card and in an email", () => {
  it("says From for more than one active Variant, priced alike or not, in both", () => {
    for (const variants of [
      [variant("a", 59), variant("b", 59)],
      [variant("a", 49), variant("b", 39)],
    ]) {
      expect(cardPrice(variants)).toMatch(/^From /);
      expect(emailPrice(variants)).toMatch(/^from /);
    }
  });

  it("is the one price with one active Variant, in both", () => {
    const variants = [variant("a", 29.5), variant("b", 19, { is_active: false })];
    expect(cardPrice(variants)).not.toMatch(/From/);
    expect(cardPrice(variants)).toContain("29.50");
    expect(emailPrice(variants)).not.toMatch(/from/);
    expect(emailPrice(variants)).toContain("29.50");
  });

  it("strikes through the cheapest Variant's compare-at only when it is above its price, in both", () => {
    const sale = [variant("a", 45, { compare_at_price: 59 })];
    expect(renderToStaticMarkup(<ProductCard product={product(sale)} />)).toMatch(/line-through[^>]*>[^<]*59\.00/);
    expect(emailPrice(sale)).toMatch(/45\.00 \(was .*59\.00\)/);
    const notSale = [variant("a", 45, { compare_at_price: 45 })];
    expect(renderToStaticMarkup(<ProductCard product={product(notSale)} />)).not.toContain("line-through");
    expect(emailPrice(notSale)).not.toContain("was");
  });
});
