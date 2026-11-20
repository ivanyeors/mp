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

const accesses = grepLines(`\\.(stripe_product_id|stripe_price_id)\\b`).filter((line) => {
  const [file] = line.split(":");
  return (
    file !== "lib/stripe/mode.ts" &&
    !file.endsWith(".check.ts") &&
    !file.includes("__tests__") &&
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
