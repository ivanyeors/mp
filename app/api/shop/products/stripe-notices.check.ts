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
  for (const field of ["pricesInPlace", "notices", "paymentLinkCleared"]) {
    assert.match(
      src,
      new RegExp(`${field}: stripe\\.${field},`),
      `${path} does not pass the sync's ${field} on`,
    );
  }
}

const syncRoute = read("app/api/stripe/sync/route.ts");
assert.match(syncRoute, /const \{ pricesInPlace, notices, paymentLinkCleared \} = outcome;/);
assert.equal(
  syncRoute.match(/pricesInPlace,\s+notices,\s+paymentLinkCleared,/g)?.length,
  2,
  "Sync to Stripe must pass pricesInPlace, notices and paymentLinkCleared on in both its answers",
);

const editor = read("app/[lang]/settings/products/[id]/product-editor-client.tsx");

const handlers = [...editor.matchAll(/\n {4}const (\w+) = async \([^)]*\) => \{([\s\S]*?)\n {4}\};/g)];
const productRouteCall =
  /fetch\(\s*`\/api\/shop\/products\/\$\{id\}(?:\/variants(?:\/\$\{[^}]+\})?)?`,\s*\{\s*method: "(?:PATCH|POST)"/;
const callers = handlers.filter(([, , body]) => productRouteCall.test(body));
assert.deepEqual(
  callers.map(([, name]) => name).sort(),
  ["handleSave", "handleVariantSave", "toggleVariantActive"],
  "the handlers that write through the product routes changed; check each shows the Stripe outcome",
);
for (const [, name, body] of callers) {
  assert.match(body, /showStripeOutcome\(data\.stripe\)/, `${name} ignores the Stripe sync outcome`);
}

const sync = handlers.find(([, name]) => name === "handleSyncToStripe");
assert.ok(sync, "handleSyncToStripe not found");
const afterBranches = sync[2].split(/\n {12}\}\n/).slice(1).join("\n");
assert.match(
  afterBranches,
  /showStripeNotices\(data\.notices, data\.paymentLinkCleared\)/,
  "Sync to Stripe must show notices and clear the link whether or not the sync threw",
);
assert.match(sync[2], /else if \(data\.pricesInPlace\)/);

const outcome = editor.match(/const showStripeOutcome = [\s\S]*?\n {4}\};/)?.[0] ?? "";
assert.match(outcome, /stripe\.synced === false && stripe\.pricesInPlace/);
assert.match(outcome, /showStripeNotices\(stripe\.notices, stripe\.paymentLinkCleared\);\n {4}\};$/);
assert.match(editor, /if \(paymentLinkCleared\) setStripePaymentLink\(null\)/);

assert.doesNotMatch(
  editor,
  /\.stripe_payment_link\b/,
  "the editor reads a payment link column directly; use stripePaymentLinkUrlOf(row, stripeMode)",
);
assert.equal(editor.match(/stripePaymentLinkUrlOf\([^)]*, stripeMode\)/g)?.length, 2);

console.log("stripe-notices.check.ts: ok");
