import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "app/api/stripe/payment-link/route.ts"), "utf8");
const editor = readFileSync(
  join(ROOT, "app/[lang]/settings/products/[id]/product-editor-client.tsx"),
  "utf8",
);

const okBody = route.match(/NextResponse\.json\(\{\s*ok: true,([\s\S]*?)\}\)/);
assert.ok(okBody, "payment-link route: success response not found");
const routeKeys = new Set([...okBody[1].matchAll(/(\w+):/g)].map((m) => m[1]));
assert.ok(routeKeys.has("payment_link_url"), "payment-link route no longer returns payment_link_url");

const handler = editor.match(/const handleGeneratePaymentLink = async \(\) => \{([\s\S]*?)\n {4}\};/);
assert.ok(handler, "product editor: handleGeneratePaymentLink not found");
const readKeys = [...handler[1].matchAll(/\bdata\.(\w+)/g)]
  .map((m) => m[1])
  .filter((k) => k !== "ok" && k !== "error");
assert.ok(readKeys.length > 0, "handleGeneratePaymentLink reads no key from the response");
for (const key of readKeys) {
  assert.ok(
    routeKeys.has(key),
    `handleGeneratePaymentLink reads data.${key}, which /api/stripe/payment-link does not return (it returns ${[...routeKeys].join(", ")})`,
  );
}
assert.match(handler[1], /setStripePaymentLink\(data\.payment_link_url\)/);

console.log("payment-link-keys.check.ts: ok");
