/**
 * ponytail: runnable self-check for Page FAQ store helpers + seed invariants.
 * Run: npx tsx lib/page-faq/page-faq.check.ts
 */
import assert from "node:assert/strict";
import { stripMarkdownForSchema } from "@/lib/faq";
import { PAGE_FAQ_DEFAULTS } from "./defaults";
import { isValidSurfaceKey, parseSurfaceKey, productSurfaceKey } from "./surface-key";

// surface_key accept
assert.equal(isValidSurfaceKey("home"), true);
assert.equal(isValidSurfaceKey("mp-config"), true);
assert.equal(isValidSurfaceKey("mbolster-config"), true);
assert.equal(
  isValidSurfaceKey(productSurfaceKey("84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99")),
  true
);

// surface_key reject
assert.equal(isValidSurfaceKey("shop"), false);
assert.equal(isValidSurfaceKey("product:not-a-uuid"), false);
assert.equal(isValidSurfaceKey("product:"), false);
assert.equal(isValidSurfaceKey("PRODUCT:84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99"), false);

assert.deepEqual(parseSurfaceKey("home"), { kind: "fixed", surface: "home" });
assert.deepEqual(parseSurfaceKey("product:84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99"), {
  kind: "product",
  productId: "84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99",
});
assert.equal(parseSurfaceKey("nope"), null);

// seed bilingual + no duplicate slugs per set
assert.ok(PAGE_FAQ_DEFAULTS.length >= 6, "expected fixed + main PDP defaults");

const fixedKeys = new Set(
  PAGE_FAQ_DEFAULTS.filter((d) => d.surfaceKey).map((d) => d.surfaceKey)
);
assert.ok(fixedKeys.has("home"));
assert.ok(fixedKeys.has("mp-config"));
assert.ok(fixedKeys.has("mbolster-config"));

const productSlugs = PAGE_FAQ_DEFAULTS.filter((d) => d.productSlug).map((d) => d.productSlug);
assert.ok(productSlugs.includes("mpillow-basic"));
assert.ok(productSlugs.includes("mpillow-premium"));
assert.ok(productSlugs.includes("mbolster"));

for (const def of PAGE_FAQ_DEFAULTS) {
  const label = def.surfaceKey ?? def.productSlug ?? "?";
  assert.ok(def.titles["en-US"], `missing en-US title: ${label}`);
  assert.ok(def.titles["zh-CN"], `missing zh-CN title: ${label}`);
  assert.ok(def.items.length >= 3, `too few items: ${label}`);
  const slugs = new Set<string>();
  for (const item of def.items) {
    assert.ok(item.content["en-US"]?.question, `missing en-US question: ${item.slug}`);
    assert.ok(item.content["en-US"]?.answer, `missing en-US answer: ${item.slug}`);
    assert.ok(item.content["zh-CN"]?.question, `missing zh-CN question: ${item.slug}`);
    assert.ok(item.content["zh-CN"]?.answer, `missing zh-CN answer: ${item.slug}`);
    assert.ok(!slugs.has(item.slug), `duplicate slug in ${label}: ${item.slug}`);
    slugs.add(item.slug);
  }
}

assert.equal(
  stripMarkdownForSchema("See [our guide](/mp-care) for **details**."),
  "See our guide for details."
);

console.log("page-faq self-check ok");
