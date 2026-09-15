/**
 * Self-check: the order-fulfilment payment_status gate in the Stripe webhook.
 * Run: npx tsx lib/stripe/fulfilment-gate.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldFulfilOrder } from "./fulfilment-gate";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// --- The gate ---
assert.equal(shouldFulfilOrder("paid"), true, "paid → fulfil");
assert.equal(shouldFulfilOrder("unpaid"), false, "unpaid → wait for settlement");
assert.equal(
  shouldFulfilOrder("no_payment_required"),
  true,
  "100%-discount order is legitimately zero and must still fulfil",
);

// --- Wiring: the webhook must actually gate on `unpaid`, not on `!== paid` ---
const webhook = read("app/api/stripe/webhook/route.ts");

assert.ok(
  webhook.includes('session.payment_status === "unpaid"'),
  "order path must gate on `unpaid` — `!== \"paid\"` strands no_payment_required orders",
);

// --- Wiring: delayed settlement must re-enter the same fulfilment block ---
assert.ok(
  /case "checkout\.session\.completed":\s*\n\s*case "checkout\.session\.async_payment_succeeded":/.test(
    webhook,
  ),
  "async_payment_succeeded must share the completed block, or settled money never fulfils",
);
assert.ok(
  webhook.includes('case "checkout.session.async_payment_failed"'),
  "async_payment_failed must be handled, or a never-settling order sits pending forever",
);

// --- Wiring: the unpaid branch must not strand the cart or go unnoticed ---
const unpaidBranch = webhook.slice(
  webhook.indexOf('session.payment_status === "unpaid"'),
);
const branchBody = unpaidBranch.slice(0, unpaidBranch.indexOf("break;"));

assert.ok(
  branchBody.includes('from("carts").delete()'),
  "unpaid branch must clear the cart — the session is spent, and a live cart lets the shopper pay twice",
);
assert.ok(
  branchBody.includes("needs_attention: true"),
  "unpaid branch must flag the order — nothing else sweeps for money-in-flight",
);

// --- The hold branch must stay ungated (manual capture reads `unpaid` by design) ---
const holdStamp = webhook.indexOf("attachHoldPaymentIntent(admin, session)");
const gate = webhook.indexOf('session.payment_status === "unpaid"');
assert.ok(
  holdStamp > 0 && holdStamp < gate,
  "authorization-hold stamp must precede the gate, or holds stop recording their PaymentIntent",
);
// The shared writer keys on session.status, never payment_status.
const holdWriter = read("lib/authorization-hold/index.ts");
assert.ok(
  holdWriter.includes(".update({ payment_intent_id: paymentIntentId })") &&
    !holdWriter.includes("session.payment_status"),
  "the hold writer must not gate on payment_status — a manual-capture hold reads `unpaid`",
);

console.log("fulfilment-gate.check.ts OK");
