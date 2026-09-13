/**
 * A Stripe id is only valid in the account that made it.
 *
 * `products.stripe_product_id` / `product_variants.stripe_price_id` hold the LIVE
 * account's ids and `*_test` the sandbox's, because localhost and Vercel share one
 * database while pointing at two Stripe accounts. Reading the column straight off a
 * row silently picks live — which on localhost means charging against a Price that
 * does not exist there, and in the admin means "linked to Stripe" for an account you
 * are not looking at.
 *
 * So: nothing outside `lib/stripe/mode.ts` may name those columns except to declare
 * them (types, zod schemas, the sync's own return shape) or to select them.
 *
 * Run: npx tsx lib/stripe/mode.check.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

function grepLines(pattern: string): string[] {
  try {
    return execFileSync("grep", ["-rnE", pattern, "app", "lib", "components", "scripts"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Property ACCESS on a row — `x.stripe_price_id`, `v?.stripe_product_id`. Object
 * keys (`stripe_price_id:`) are declarations and select strings are queries; both
 * are fine and neither matches a leading dot.
 */
const accesses = grepLines(`\\.(stripe_product_id|stripe_price_id)\\b`).filter((line) => {
  const [file] = line.split(":");
  return (
    file !== "lib/stripe/mode.ts" &&
    !file.endsWith(".check.ts") &&
    !file.includes("__tests__") &&
    // The *_test siblings are the other half of the same pair and are read only
    // inside the resolver; a `.stripe_price_id_test` match here is the prefix of
    // `.stripe_price_id` and must not be double-counted.
    !/\.(stripe_product_id|stripe_price_id)_test\b/.test(line)
  );
});

assert.deepEqual(
  accesses,
  [],
  "Stripe ids must be read through stripeProductIdOf() / stripePriceIdOf(), which " +
    "pick the column for the account this environment's key belongs to:\n" +
    accesses.map((l) => `  ${l.trim()}`).join("\n"),
);

// The writers must name a column through the helpers too, so the id lands in the
// column the reader will look at. A literal `stripe_price_id:` inside an `.update(`
// is the shape that broke: it always wrote live.
const literalWrites = grepLines(
  `\\.update\\(\\{[^}]*(stripe_product_id|stripe_price_id):`,
).filter((line) => !line.split(":")[0].endsWith(".check.ts"));

assert.deepEqual(
  literalWrites,
  [],
  "Write Stripe ids under stripeProductIdColumn() / stripePriceIdColumn():\n" +
    literalWrites.map((l) => `  ${l.trim()}`).join("\n"),
);

console.log("stripe/mode.check: ok — every Stripe id read and written per account");
