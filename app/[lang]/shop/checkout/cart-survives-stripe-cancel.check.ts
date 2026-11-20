import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const checkout = readFileSync(join(ROOT, "app/[lang]/shop/checkout/page.tsx"), "utf8");
const payOnPage = readFileSync(join(ROOT, "app/[lang]/shop/checkout/pay-on-page.tsx"), "utf8");
const walletButton = readFileSync(join(ROOT, "app/[lang]/shop/checkout/wallet-button.tsx"), "utf8");
const confirmation = readFileSync(
  join(ROOT, "app/[lang]/shop/checkout/confirmation/page.tsx"),
  "utf8"
);

assert.doesNotMatch(checkout, /clearCart\(\)/);
assert.doesNotMatch(payOnPage, /clearCart|useCart/);
assert.doesNotMatch(walletButton, /clearCart|useCart/);
assert.match(checkout, /const checkoutUrl: string = data\.checkout_url \?\? data\.url;/);
assert.match(checkout, /window\.location\.href = checkoutUrl;/);

assert.match(confirmation, /useCart\(\)/);
assert.match(confirmation, /setOrder\(data\.order\);\s*[\s\S]*?clearCart\(\);/);
assert.doesNotMatch(confirmation, /catch\(\(\) => \{[\s\S]*?clearCart/);

console.log("cart-survives-stripe-cancel.check.ts: ok");
