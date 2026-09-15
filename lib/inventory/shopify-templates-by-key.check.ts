/**
 * Run: npx tsx lib/inventory/shopify-templates-by-key.check.ts
 */
import assert from "node:assert/strict";
import { groupShopifyTemplatesByKey } from "./shopify-templates-by-key";

const grouped = groupShopifyTemplatesByKey([
  { id: 1, name: "Basic M A", kind: "pillow", key: "M", pillow_kind: "basic", pillow_variant: null },
  { id: 2, name: "Premium M Linen", kind: "pillow", key: "M", pillow_kind: "premium", pillow_variant: "linen" },
  { id: 3, name: "Premium M FC", kind: "pillow", key: "M", pillow_kind: "premium", pillow_variant: "fibrecool" },
  { id: 4, name: "Bolster Med", kind: "bolster", key: "medium", pillow_kind: null, pillow_variant: null },
]);

assert.deepEqual(grouped["pillow:basic:M"], [{ id: 1, name: "Basic M A", pillow_variant: null }]);
assert.equal(grouped["pillow:premium:M"]?.length, 2);
assert.equal(grouped["pillow:premium:M"]?.[0]?.pillow_variant, "linen");
assert.equal(grouped["pillow:premium:M"]?.[1]?.pillow_variant, "fibrecool");
assert.deepEqual(grouped["bolster:medium"], [{ id: 4, name: "Bolster Med", pillow_variant: null }]);
assert.equal(grouped["pillow:premium:L"], undefined);

console.log("shopify-templates-by-key.check.ts: ok");

// --- Shopify queue offers warehouse templates only --------------------------
// Committing a sale deducts a template's flat `bom_template_lines`. A Filling
// Template's recipe is Placement rows (ADR 0008), so picking one either fails
// with "Template has no lines" or — for a legacy pre-spatial template that
// still carries flat lines — deducts fillings against a Shopify sale, which
// ADR 0003 forbids. Guarded at the picker and again at the commit.
import { readFileSync as readSource } from "node:fs";

assert.match(
  readSource("components/settings/shopify-sales-section.tsx", "utf8"),
  /from\("bom_templates"\)[\s\S]{0,200}?\.eq\("role", "warehouse"\)/,
  "the Shopify sales-queue template picker fetches warehouse templates only",
);
assert.match(
  readSource("app/[lang]/settings/inventory/actions.ts", "utf8"),
  /Shopify sales commit from warehouse templates only/,
  "the Shopify commit refuses a non-warehouse template whatever the client posts",
);

console.log("shopify template scope guard ok");
