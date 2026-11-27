import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const CUSTOMER_ROUTES_AFTER_A_STRIPE_CALL = [
  "app/api/shop/checkout/route.ts",
  "app/api/results/hold/route.ts",
  "app/api/results/[id]/accept/route.ts",
  "app/api/results/[id]/decline/route.ts",
  "app/api/readjustments/checkout/route.ts",
];

const RAW_ERROR_MESSAGE = /instanceof Error \? \w+\.message/;
const LOGGED_ONLY = /console\.(error|warn|log)\(/;

const offenders: string[] = [];
for (const file of CUSTOMER_ROUTES_AFTER_A_STRIPE_CALL) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  if (!source.includes("errorTextWithoutStripeRequestId(")) offenders.push(`${file}: does not use errorTextWithoutStripeRequestId`);
  source.split("\n").forEach((line, index) => {
    if (RAW_ERROR_MESSAGE.test(line) && !LOGGED_ONLY.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}

assert.deepEqual(
  offenders,
  [],
  "The Stripe SDK puts its request id, [req_...], in front of every API error message. These routes answer a " +
    "customer after a Stripe call, so the words they send come from errorTextWithoutStripeRequestId " +
    "(lib/stripe/error-text.ts), never from the error's message directly:\n  " +
    offenders.join("\n  "),
);

console.log(`customer-error-text.check.ts: ok (${CUSTOMER_ROUTES_AFTER_A_STRIPE_CALL.length} routes)`);
