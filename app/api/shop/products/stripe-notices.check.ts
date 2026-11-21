import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const productRoutes = [
  "app/api/shop/products/[id]/route.ts",
  "app/api/shop/products/[id]/variants/route.ts",
  "app/api/shop/products/[id]/variants/[variantId]/route.ts",
];
for (const path of productRoutes) {
  const src = read(path);
  assert.match(src, /notices: stripe\.result\?\.notices \?\? \[\]/, `${path} does not return the sync's notices`);
  assert.match(
    src,
    /paymentLinkCleared: stripe\.result\?\.paymentLinkCleared \?\? false/,
    `${path} does not say when the payment link was cleared`,
  );
}

const syncRoute = read("app/api/stripe/sync/route.ts");
assert.match(syncRoute, /notices: result\.notices/, "Sync to Stripe does not return the notices");
assert.match(syncRoute, /paymentLinkCleared: result\.paymentLinkCleared/);

const editor = read("app/[lang]/settings/products/[id]/product-editor-client.tsx");
assert.equal(
  editor.match(/showStripeOutcome\(data\.stripe\)/g)?.length,
  2,
  "the product and variant saves must both show the Stripe outcome",
);
assert.match(editor, /showStripeNotices\(data\.notices, data\.paymentLinkCleared\)/);
assert.match(editor, /toast\.warning\(`\$\{notice/);
assert.match(editor, /if \(paymentLinkCleared\) setStripePaymentLink\(null\)/);
assert.doesNotMatch(
  editor,
  /\.stripe_payment_link\b/,
  "the editor reads a payment link column directly; use stripePaymentLinkUrlOf(row, stripeMode)",
);
assert.equal(editor.match(/stripePaymentLinkUrlOf\([^)]*, stripeMode\)/g)?.length, 2);

console.log("stripe-notices.check.ts: ok");
