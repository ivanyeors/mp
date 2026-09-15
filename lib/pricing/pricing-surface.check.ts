/**
 * One pricing rule, one place.
 *
 * The sell price of a build was re-derived in FIVE files — the hold quote, the assign
 * route, `assigned-build`, the shopper's own status route, and the preview. They had
 * already drifted: the preview showed the shelf price (360) while the server charged
 * shelf + cover + case (473), and the status route read `product_prices` with
 * `.maybeSingle()`, the exact call that errors on premium's two rows.
 *
 * Both halves of that are now structural:
 *
 *   1. `product_prices` is read only by the Costings editor, the projection into
 *      storefront variants, and `loadComposedSellable`. A sixth reader is how a sixth
 *      copy of the rule starts.
 *   2. Nothing outside `lib/pricing` may add component MSRPs onto a Costings MSRP.
 *      A Costings row is the price of a WHOLE configuration; adding the chosen cover
 *      and case on top double-charges for components the row already includes.
 *
 * Run: npx tsx lib/pricing/pricing-surface.check.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

function grepFiles(pattern: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rlE", pattern, "app", "lib", "components", "scripts"],
      { cwd: ROOT, encoding: "utf8" },
    );
    // This file names every pattern it forbids, so it always matches itself.
    return out
      .split("\n")
      .filter((f) => f && !f.endsWith(".check.ts"))
      .sort();
  } catch {
    return []; // grep exits 1 when nothing matches
  }
}

// --- 1. who may read product_prices ----------------------------------------

/** Each entry needs a reason: it is the argument against adding a seventh. */
const PRICE_TABLE_READERS: Record<string, string> = {
  "app/[lang]/settings/costings/page.tsx": "the Costings editor — the source of truth's own UI",
  "app/[lang]/settings/costings/save/route.ts": "writes Costings, then reprojects variants",
  "app/[lang]/settings/analytics/MarginByProductVisx.tsx": "reporting; reads MSRP, never charges",
  "components/settings/shopify-sales-section.tsx": "reporting against the Shopify mirror",
  "lib/landing-page-data.ts": '"from $X" marketing label; shows the cheapest family row',
  "lib/results/composed-sellable.ts": "THE loader — every money path goes through it",
  "lib/shop/price-sync.ts": "projects Costings into product_variants for the storefront",
  "lib/results/__tests__/composed-sellable.test.ts": "tests the loader",
  "app/[lang]/settings/inventory/actions.ts": "inventory templates and sale lines; reporting",
  "lib/shopify/pricing.ts":
    "pushes prices to the Shopify mirror. It still derives the premium family by " +
    "sniffing a variant TITLE (detectPremiumVariantFromTitle) rather than reading " +
    "items.price_family — it resolves correctly against today's keys, but it is the " +
    "last name-sniff on a money path and should move to the column.",
};

// Both quote styles. Matching only the double-quoted form hid two real readers, one
// of which pushes prices to a live Shopify storefront.
const readers = grepFiles(`["']product_prices["']`);
const unexpected = readers.filter((f) => !(f in PRICE_TABLE_READERS));
assert.deepEqual(
  unexpected,
  [],
  `New reader(s) of product_prices: ${unexpected.join(", ")}.\n` +
    "Price a build with loadComposedSellable() + priceComposedBuild() instead of " +
    "querying the table. If this file genuinely only reports on prices rather than " +
    "charging them, add it to PRICE_TABLE_READERS with a reason.",
);

// A stale allowlist is worse than none — it stops describing the code.
const vanished = Object.keys(PRICE_TABLE_READERS).filter((f) => !readers.includes(f));
assert.deepEqual(
  vanished,
  [],
  `PRICE_TABLE_READERS lists files that no longer read product_prices: ${vanished.join(", ")}. Remove them.`,
);

// --- 2. the goods rule lives in exactly one module --------------------------

const PRICING_MODULE = "lib/pricing/composed-price.ts";

// The old contract's field name. Its return anywhere means someone rebuilt
// "composed MSRP + every preference MSRP", which is the double-charge.
assert.deepEqual(
  grepFiles("composedSellableMsrp"),
  [],
  "`composedSellableMsrp` is gone: a Costings row is a whole configuration's price, " +
    "not a base to add the chosen cover and case onto. Use priceComposedBuild().",
);

const goodsRuleFiles = grepFiles("baselineCaseMsrpByFamily");
assert.ok(
  goodsRuleFiles.every(
    (f) => f === PRICING_MODULE || f.startsWith("lib/pricing/__tests__/"),
  ),
  `The family-baseline rule must stay inside ${PRICING_MODULE}; found in ${goodsRuleFiles.join(", ")}`,
);

// --- 3. every surface that charges routes through it ------------------------

const MUST_PRICE_THROUGH = [
  "app/api/results/hold/route.ts",
  "app/api/results/[id]/assign/route.ts",
  "app/api/results/[id]/route.ts",
  "lib/results/assigned-build.ts",
  "app/[lang]/mp-config/mp-config-client.tsx",
  "lib/shop/customization-price.ts",
];
const callers = grepFiles("priceComposedBuild");
for (const f of MUST_PRICE_THROUGH) {
  assert.ok(
    callers.includes(f),
    `${f} must price through priceComposedBuild() — it shows or charges a build total.`,
  );
}

// The shop customizer and mp-maker reach the rule through one adapter, which only
// translates ConfigLine[] and returns priceComposedBuild's own result. Both the
// quote the shopper sees and the amount the apply route stores must come from it,
// or they drift again — this is the pair that quoted a basic XS Fibrecool at 258.
const SHOP_SURFACES = [
  "lib/shop/customization-quote.ts",
  "components/shop/customization-steps.tsx",
];
const shopCallers = grepFiles("priceCustomizedBuild");
for (const f of SHOP_SURFACES) {
  assert.ok(
    shopCallers.includes(f),
    `${f} must price through priceCustomizedBuild() — it shows or charges a build total.`,
  );
}

// The apply route stores the amount and checkout charges it, both through that one
// server quote. Checkout once charged the stored snapshot instead, so a cheap
// variant_id could carry a full build (#170).
const SHOP_MONEY_PATHS = ["app/api/shop/customize/route.ts", "app/api/shop/checkout/route.ts"];
const quoteCallers = grepFiles("quoteCustomization");
for (const f of SHOP_MONEY_PATHS) {
  assert.ok(
    quoteCallers.includes(f),
    `${f} must price through quoteCustomization() — it stores or charges a build total.`,
  );
}

// The rule it replaced: `quantity above BOM x full item MSRP`, which reads a
// substitution as an added part and double-charges for a component the Costings row
// already includes.
assert.deepEqual(
  grepFiles("calculateAddonPrice"),
  [],
  "`calculateAddonPrice` is gone: swapping a case is not adding one. Price through " +
    "priceCustomizedBuild(), which charges only the difference.",
);

console.log(
  `pricing-surface.check: ok — ${readers.length} price-table readers, ` +
    `${MUST_PRICE_THROUGH.length + SHOP_SURFACES.length + SHOP_MONEY_PATHS.length} surfaces on the shared rule`,
);
