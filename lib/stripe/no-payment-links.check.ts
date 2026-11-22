import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "components", "hooks", "lib", "scripts"];
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP = /(^|\/)(__tests__|node_modules)(\/|$)|\.(test|check)\.[a-z]+$/;

const STRIPE_PAYMENT_LINKS = /\bpaymentLinks\b|(?<!order_)payment_links\b|\bstripe_payment_link/;

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`;
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) walk(rel, out);
    else if (SOURCE.test(entry.name)) out.push(rel);
  }
}

const files: string[] = [];
for (const dir of DIRS) walk(dir, files);
assert.ok(files.length > 100, `only ${files.length} source files found; is the check running from the repo root?`);

const offenders = files.filter((file) => STRIPE_PAYMENT_LINKS.test(readFileSync(path.join(ROOT, file), "utf8")));
assert.deepEqual(
  offenders,
  [],
  "Stripe Payment Links (buy.stripe.com) take money the webhook cannot turn into an Order: no order_id, no address, " +
    "no shipping, no tax and no stock check. Sell through the shop checkout or a Staff order's Payment link " +
    "(ADR 0048). Found in:\n  " +
    offenders.join("\n  "),
);

console.log(`no-payment-links.check.ts: ok (${files.length} files)`);
