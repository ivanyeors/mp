import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  holdCtaLabel,
  isPreOrder,
  preferenceStockFor,
  preOrderWaitingCopy,
} from "./pre-order-trigger";

assert.deepEqual(
  isPreOrder({ preferenceStocks: [0], composedBuildable: 5 }),
  { isPreOrder: true },
  "preference-zero → Pre-order",
);
assert.deepEqual(
  isPreOrder({ preferenceStocks: [10, 0], composedBuildable: 5 }),
  { isPreOrder: true },
  "any required preference at 0 → Pre-order",
);
assert.deepEqual(
  isPreOrder({ preferenceStocks: [10], composedBuildable: 0 }),
  { isPreOrder: true },
  "buildable-zero → Pre-order",
);
assert.deepEqual(
  isPreOrder({ preferenceStocks: [3], composedBuildable: 5 }),
  { isPreOrder: false },
  "soft low-stock (qty 3) alone does not flip",
);
assert.deepEqual(
  isPreOrder({ preferenceStocks: [10, 8], composedBuildable: 2 }),
  { isPreOrder: false },
  "in-stock preferences + buildable > 0 → not Pre-order",
);
assert.deepEqual(
  isPreOrder({ preferenceStocks: [], composedBuildable: 0 }),
  { isPreOrder: true },
  "empty prefs + buildable 0 still Pre-order",
);

assert.equal(holdCtaLabel(true), "Pre-order");
assert.equal(holdCtaLabel(false), "Proceed");

assert.equal(preferenceStockFor(null, [{ item_id: 1, stock_available: 0 }]), null);
assert.equal(preferenceStockFor(1, [{ item_id: 1, stock_available: 3 }]), 3);
assert.equal(preferenceStockFor(9, [{ item_id: 1, stock_available: 0 }]), null);

const en = preOrderWaitingCopy("en-US");
const zh = preOrderWaitingCopy("zh-CN");
assert.match(en.title, /Pre-order/i);
assert.match(en.body, /WhatsApp/i);
assert.match(en.body, /Sign in/i);
assert.match(en.body, /Result/);
assert.match(zh.title, /预购/);
assert.match(zh.body, /WhatsApp/);
assert.match(zh.body, /登录|登入/);
assert.match(zh.body, /Result/);
assert.notEqual(en.body, zh.body);

const mp = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
const bolster = readFileSync(
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "utf8",
);
for (const [name, src] of [
  ["mp-config", mp],
  ["mbolster-config", bolster],
] as const) {
  assert.match(src, /isPreOrder/, `${name} uses trigger`);
  assert.match(src, /holdCtaLabel/, `${name} uses CTA helper`);
  assert.match(src, /preOrderWaitingCopy/, `${name} waiting copy`);
  assert.match(src, /composed_buildable/, `${name} reads composed buildable`);
  assert.doesNotMatch(
    src,
    /holdSubmitting \? "Redirecting…" : "Proceed"/,
    `${name} must not hard-code Proceed CTA`,
  );
  assert.doesNotMatch(src, /\bPurchase\b/, `${name} must not use Purchase for hold CTA`);
}

const recType = readFileSync("components/shop/customization-steps.tsx", "utf8");
assert.match(recType, /composed_buildable\??:\s*number/);

assert.match(
  readFileSync("app/api/mp-basic/recommend/route.ts", "utf8"),
  /product_id[\s\S]*composed_buildable/,
);
assert.match(
  readFileSync("app/api/shop/customize/route.ts", "utf8"),
  /composed_buildable/,
);

console.log("pre-order-trigger self-check ok");
