/**
 * ponytail: runnable self-check — fails if SEO helpers regress.
 * Run: npx tsx lib/seo/seo.check.ts
 */
import assert from "node:assert/strict";
import { resolveAnswerLede } from "@/lib/seo/answer-lede";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildLlmsIndex } from "@/lib/seo/llms-index";
import { buildProductJsonLd } from "@/lib/seo/jsonld-product";
import type { Product } from "@/lib/types/ecommerce";

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

// answer-lede fallbacks
assert.equal(resolveAnswerLede({ seo_answer: "Direct answer." }), "Direct answer.");
assert.equal(
  resolveAnswerLede({ seo_description: "Meta desc.", description: "Body." }),
  "Meta desc.",
);
assert.equal(resolveAnswerLede({}), null);

// metadata canonical
const meta = buildPageMetadata({
  title: "Test",
  description: "Desc",
  path: "/shop/foo",
  lang: "en-US",
});
assert.equal(String(meta.alternates?.canonical), "https://custom.mpillow.com/en-US/shop/foo");

// llms index curated (no blog bodies)
const llms = buildLlmsIndex([{ slug: "cervical-support", title: "Cervical Support" }]);
assert.ok(llms.length < 10_000);
assert.ok(llms.includes("Product taxonomy"));
assert.ok(!llms.includes("### Full Content"));

// product jsonld — no rating when count=0
const stubProduct = {
  id: "p1",
  slug: "test",
  variants: [{ id: "v1", sku: "SKU-1", price: 100, currency: "SGD", is_active: true, stock_available: 5 }],
  images: [],
} as unknown as Product;
const jsonLd = buildProductJsonLd({
  product: stubProduct,
  lang: "en-US",
  slug: "test",
  title: "Test Pillow",
  description: "A test pillow.",
  priceRange: { min: 100, max: 100, currency: "SGD" },
  reviews: { average: 0, count: 0 },
});
assert.equal(jsonLd.sku, "SKU-1");
assert.equal(jsonLd.aggregateRating, undefined);

const withReviews = buildProductJsonLd({
  product: stubProduct,
  lang: "en-US",
  slug: "test",
  title: "Test",
  description: "Desc",
  priceRange: { min: 100, max: 100, currency: "SGD" },
  reviews: { average: 4.5, count: 2 },
});
assert.ok(withReviews.aggregateRating);

console.log("lib/seo self-check: ok");
