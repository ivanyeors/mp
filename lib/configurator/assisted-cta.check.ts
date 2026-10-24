/**
 * Assisted customisation: sent to the build team from the questionnaire, never
 * asked for a card (ADR 0017).
 *
 * Structural, by source inspection, because the failure is silent and expensive.
 * Three ways it regresses, all of which look harmless in a diff:
 *
 *   1. The questionnaire CTA goes back to "Customise" for an assisted run, so the
 *      customer lands on the finish page before Staff have built the fillings.
 *   2. The hold CTA is restored unconditionally, so a customer who was told
 *      "no payment needed" is asked for a card at the last step.
 *   3. "Save without purchasing" is rendered again in assisted mode. It writes a
 *      second, conflicting no-purchase submit through the responses route —
 *      the in-store review-only path that used to rewrite `source` to "manual".
 *
 * Run: npx tsx lib/configurator/assisted-cta.check.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { holdCtaLabel } from "./pre-order-trigger";

const CLIENT = join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx");
const src = readFileSync(CLIENT, "utf8");

// --- the label itself -------------------------------------------------------

assert.equal(holdCtaLabel(false, false), "Proceed");
assert.equal(holdCtaLabel(true, false), "Pre-order");
assert.equal(
  holdCtaLabel(false, true),
  "Send to our build team",
  "assisted preview must not offer a payment CTA",
);
assert.equal(
  holdCtaLabel(true, true),
  "Send to our build team",
  "assisted wins over Pre-order — neither takes a card, and Pre-order promises a checkout that is not coming",
);

// --- and that the client actually asks for it -------------------------------

assert.match(
  src,
  /holdCtaLabel\(\s*preOrder\s*,\s*assisted\s*\)/,
  "the preview CTA must be derived with the assisted flag, or assisted customers see a card prompt",
);

assert.match(
  src,
  /const assisted = Boolean\(assistCode\)/,
  "`assisted` must come from the server-resolved Assist link code, not from any client-settable state",
);

// `assistCode` governs the CTA only. It must never gate staff chrome: a customer
// holding a link has no admin_users row at all. staff-assist.check.ts owns the
// other half of this (that assistCode and staffAssist stay separate props).
assert.ok(
  !/staffAssist\s*=\s*[^;\n]*assistCode/.test(src),
  "assistCode must never feed staffAssist — that would hand the x-ray editor to every link holder",
);

// --- the questionnaire is the assisted submit ---------------------------------

assert.match(
  src,
  /assisted\s*\?\s*handleSendToBuildTeam\(\)/,
  "an assisted questionnaire must send to the build team, not advance to the finish page",
);
assert.match(
  src,
  /assisted\s*\?\s*holdCtaLabel\(false, assisted\)/,
  'the questionnaire CTA must read "Send to our build team" for an assisted run',
);
const sendAt = src.indexOf("const handleSendToBuildTeam");
const sendBody = src.slice(sendAt, src.indexOf("const handleFinishAndPay", sendAt));
assert.ok(sendAt !== -1 && sendBody.includes("deferred: true"), "the assisted submit is deferred (no card)");
assert.ok(
  !/preferenceLines|shippingMethodId|shippingAddress/.test(sendBody),
  "the assisted submit carries no finish — the customer chooses it after Staff assign",
);

// --- the no-purchase button is not mounted in assisted mode -----------------

// Index arithmetic rather than one wide regex: the button's onClick is ~3 KB, so
// a windowed match would either miss it or be so loose it proves nothing. Both
// strings are unique in the file, so "the guard opens before the label, and
// nothing else opens a guard in between" is the exact structural claim.
const GUARD = "{!assisted && !resumeFinish && askingDetails && (";
const labelAt = src.indexOf("Save without purchasing");
const guardAt = src.lastIndexOf(GUARD, labelAt);
assert.equal(
  src.split("Save without purchasing").length - 1,
  1,
  "expected exactly one no-purchase control in the preview",
);
assert.ok(
  guardAt !== -1,
  '"Save without purchasing" must be render-gated on !assisted — see the header comment for what it costs',
);
assert.ok(
  !src.slice(guardAt + 1, labelAt).includes("{!assisted"),
  "the guard nearest the no-purchase control must be the one wrapping it",
);

console.log("assisted-cta.check: all assertions passed");
