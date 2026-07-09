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
