import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "scripts/stripe-sync-all.ts"), "utf8");

const success = src.match(/const result = await syncProductToStripe\(p\.id\);([\s\S]*?)\} catch \(err\) \{/);
assert.ok(success, "stripe-sync-all: the per-product try block was not found");
assert.match(success[1], /for \(const notice of result\.notices\)/, "a successful sync's notices are not printed");

const failure = src.match(/\} catch \(err\) \{([\s\S]*?)\n {4}\}\n {2}\}/);
assert.ok(failure, "stripe-sync-all: the per-product catch block was not found");
assert.match(
  failure[1],
  /if \(err instanceof StripeNeedsAttentionError\) \{\s*for \(const notice of err\.notices\)/,
  "when the sync throws StripeNeedsAttentionError, the operator is not told what was done (err.notices)",
);

console.log("stripe-sync-all.check.ts: ok");
