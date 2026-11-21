import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { holdCtaLabel } from "./pre-order-trigger";

const CLIENT = join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx");
const src = readFileSync(CLIENT, "utf8");

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

assert.ok(
  !/staffAssist\s*=\s*[^;\n]*assistCode/.test(src),
  "assistCode must never feed staffAssist — that would hand the x-ray editor to every link holder",
);

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
