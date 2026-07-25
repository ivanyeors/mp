/**
 * Issue #66: checkout page pins a mobile "Pay with Stripe" CTA in the shared
 * MobileStickyActionBar, wired to the same #checkout-form submit.
 * Run: npx tsx "app/[lang]/shop/checkout/checkout-sticky-cta.check.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "app/[lang]/shop/checkout/page.tsx"), "utf8");

assert.match(src, /MobileStickyActionBar/);
// Sticky button reuses the existing form's submit (no duplicated pay logic).
assert.match(src, /id="checkout-form"/);
assert.match(src, /form="checkout-form"/);
// Desktop inline Pay button preserved but hidden on mobile.
assert.match(src, /max-md:hidden/);

console.log("checkout-sticky-cta.check.ts: ok");
