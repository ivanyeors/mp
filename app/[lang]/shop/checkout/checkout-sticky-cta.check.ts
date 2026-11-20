import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "app/[lang]/shop/checkout/page.tsx"), "utf8");

assert.match(src, /MobileStickyActionBar/);
assert.match(src, /id="checkout-form"/);
assert.match(src, /form="checkout-form"/);
assert.match(src, /max-md:hidden/);

console.log("checkout-sticky-cta.check.ts: ok");
