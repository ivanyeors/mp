/**
 * Mobile R2 (#58): custom controls must reach the 44px touch target on mobile.
 * Assert each owned control source carries the max-md:min-h-11 token.
 * Run: npx tsx components/shop/custom-tap-targets.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const variantSelector = read("components/shop/variant-selector.tsx");
const cartItemRow = read("components/shop/cart/cart-item-row.tsx");
const quantitySelector = read("components/shop/quantity-selector.tsx");

// Variant option swatches: ≥44px tall on mobile
assert.match(variantSelector, /max-md:min-h-11/, "variant swatch missing 44px min-height");

// Cart-line remove control: ≥44px hit area on mobile
assert.match(cartItemRow, /max-md:min-h-11/, "cart remove button missing 44px min-height");
assert.match(cartItemRow, /max-md:min-w-11/, "cart remove button missing 44px min-width");

// Quantity stepper +/- buttons: ≥44px on mobile
assert.match(quantitySelector, /max-md:min-h-11/, "quantity stepper missing 44px min-height");
assert.match(quantitySelector, /max-md:min-w-11/, "quantity stepper missing 44px min-width");

// NOTE: appointment time-slot buttons (#58) live in
// components/slide-in-pages/booking-flow.tsx (grid-cols-3, h-9), NOT in
// book-appointment-sheet.tsx which this agent owns. That file is out of scope
// for this agent — flagged as HITL, not asserted here.

console.log("custom-tap-targets.check.ts: ok");
