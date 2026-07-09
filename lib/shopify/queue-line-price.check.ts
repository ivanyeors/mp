/**
 * Run: npx tsx lib/shopify/queue-line-price.check.ts
 */
import assert from "node:assert/strict";
import {
  detectPremiumVariantFromTitle,
  parseReplaceLinesFromMetadata,
  resolveShopifyQueueLineMsrp,
  sumReplaceLinesMsrp,
} from "./queue-line-price";

assert.equal(detectPremiumVariantFromTitle("Premium Fibrecool M"), "fibrecool");
assert.equal(detectPremiumVariantFromTitle("Linen / Sage"), "linen");

const pillowIds = new Map([["premium:M", 10], ["basic:M", 11]]);
const productMsrp = new Map<string, number>([
  ["product:pillow:10:linen", 199],
  ["product:pillow:10:fibrecool", 219],
  ["product:pillow:11", 99],
  ["product:bolster:medium", 89],
]);
const itemMsrp = new Map<number, number>([[42, 15]]);

assert.equal(
  resolveShopifyQueueLineMsrp({
    kind: "part",
    pillowSize: null,
    pillowKind: null,
    bolsterVariant: null,
    itemId: 42,
    variantTitle: null,
    templatePillowVariant: null,
    pillowProductIdByKindSize: pillowIds,
    productMsrpByKey: productMsrp,
    itemMsrpById: itemMsrp,
  }),
  15,
);

assert.equal(
  resolveShopifyQueueLineMsrp({
    kind: "bolster",
    pillowSize: null,
    pillowKind: null,
    bolsterVariant: "medium",
    itemId: null,
    variantTitle: null,
    templatePillowVariant: null,
    pillowProductIdByKindSize: pillowIds,
    productMsrpByKey: productMsrp,
    itemMsrpById: itemMsrp,
  }),
  89,
);

assert.equal(
  resolveShopifyQueueLineMsrp({
    kind: "pillow",
    pillowSize: "M",
    pillowKind: "basic",
    bolsterVariant: null,
    itemId: null,
    variantTitle: null,
    templatePillowVariant: null,
    pillowProductIdByKindSize: pillowIds,
    productMsrpByKey: productMsrp,
    itemMsrpById: itemMsrp,
  }),
  99,
);

// Template selection wins over title heuristic
assert.equal(
  resolveShopifyQueueLineMsrp({
    kind: "pillow",
    pillowSize: "M",
    pillowKind: "premium",
    bolsterVariant: null,
    itemId: null,
    variantTitle: "Linen / Sage",
    templatePillowVariant: "fibrecool",
    pillowProductIdByKindSize: pillowIds,
    productMsrpByKey: productMsrp,
    itemMsrpById: itemMsrp,
  }),
  219,
);

assert.equal(
  resolveShopifyQueueLineMsrp({
    kind: "pillow",
    pillowSize: "M",
    pillowKind: "premium",
    bolsterVariant: null,
    itemId: null,
    variantTitle: "Fibrecool",
    templatePillowVariant: null,
    pillowProductIdByKindSize: pillowIds,
    productMsrpByKey: productMsrp,
    itemMsrpById: itemMsrp,
  }),
  219,
);

assert.equal(
  sumReplaceLinesMsrp([{ item_id: 42, quantity: 2 }], itemMsrp),
  30,
);

assert.equal(sumReplaceLinesMsrp([{ item_id: 42, quantity: 1 }], itemMsrp), 15);
assert.equal(sumReplaceLinesMsrp([{ item_id: 999, quantity: 1 }], itemMsrp), null);

assert.deepEqual(parseReplaceLinesFromMetadata({ replace_lines: [{ item_id: 42, quantity: 2 }] }), [
  { item_id: 42, quantity: 2 },
]);
assert.equal(parseReplaceLinesFromMetadata({}), null);

console.log("queue-line-price.check.ts: ok");
