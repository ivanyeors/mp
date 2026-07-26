/**
 * Issues #67 + #60: PDP mobile sticky Add-to-Cart via shared bar, gallery
 * swipe/snap, and full image set (no thumbnail cap).
 * Run: npx tsx "app/[lang]/shop/[slug]/pdp-mobile.check.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(
  join(ROOT, "app/[lang]/shop/[slug]/product-detail-client.tsx"),
  "utf8",
);

// #67 shared sticky bar
assert.match(src, /MobileStickyActionBar/);

// #60 gallery swipe/snap gesture
assert.match(src, /snap-x/);
// #60 pinch-zoom scoped to the gallery image
assert.match(src, /touch-action:pinch-zoom/);

// #60 full image set — no .slice(0, N) cap on the gallery images
assert.doesNotMatch(src, /images\.slice\(0,\s*\d/);
assert.doesNotMatch(src, /\.slice\(0,\s*5\)/);

console.log("pdp-mobile.check.ts: ok");
