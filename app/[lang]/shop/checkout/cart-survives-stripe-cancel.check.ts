/**
 * The local cart must survive a cancelled Stripe Checkout: the checkout page
 * redirects to Stripe (or opens the on-page payment step, ADR 0052) without
 * clearing the cart, and the confirmation page clears it only after the paid
 * order is loaded for the Stripe session.
 * Run: npx tsx "app/[lang]/shop/checkout/cart-survives-stripe-cancel.check.ts"
 * CI runs it through `__tests__/checkout-page-surface.test.ts`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const checkout = readFileSync(join(ROOT, "app/[lang]/shop/checkout/page.tsx"), "utf8");
const payOnPage = readFileSync(join(ROOT, "app/[lang]/shop/checkout/pay-on-page.tsx"), "utf8");
const confirmation = readFileSync(
  join(ROOT, "app/[lang]/shop/checkout/confirmation/page.tsx"),
  "utf8"
);

// Checkout page never clears the cart before handing off to Stripe, on its
// page or on ours.
assert.doesNotMatch(checkout, /clearCart\(\)/);
assert.doesNotMatch(payOnPage, /clearCart|useCart/);
assert.match(checkout, /const checkoutUrl: string = data\.checkout_url \?\? data\.url;/);
assert.match(checkout, /window\.location\.href = checkoutUrl;/);

// Confirmation page clears the cart once the order fetch (gated by session_id)
// succeeds — not on mount, not on error.
assert.match(confirmation, /useCart\(\)/);
assert.match(confirmation, /setOrder\(data\.order\);\s*[\s\S]*?clearCart\(\);/);
assert.doesNotMatch(confirmation, /catch\(\(\) => \{[\s\S]*?clearCart/);

console.log("cart-survives-stripe-cancel.check.ts: ok");
