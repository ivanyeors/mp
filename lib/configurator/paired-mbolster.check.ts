/**
 * Paired build stepper self-check (ADR 0026).
 * Run: npx tsx lib/configurator/paired-mbolster.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  bolsterSleepPosition,
  opensPairedDetails,
  pairedDetailsPath,
  pairedHoldBody,
  parsePairedHandoff,
  reanchorPairedHandoff,
  runsPairedStepper,
  type PairedBolster,
  type PairedHandoff,
} from "./paired-mbolster";

// --- Who gets the stepper: a card-holding shopper whose graph routes to Mbolster ---
const base = { routeTarget: "mbolster" as const, assisted: false, partnerAssisted: false, reopened: false };
assert.equal(runsPairedStepper(base), true, "Mbolster route on a plain hold → stepper");
assert.equal(runsPairedStepper({ ...base, routeTarget: "premium-mpillow" }), false, "an upgrade route is the Upsell card's");
assert.equal(runsPairedStepper({ ...base, routeTarget: null }), false, "no route, no stepper");
assert.equal(runsPairedStepper({ ...base, assisted: true }), false, "an Assisted customisation is sent without a finish");
assert.equal(runsPairedStepper({ ...base, partnerAssisted: true }), false, "partner runs see no upsells");
assert.equal(runsPairedStepper({ ...base, reopened: true }), false, "a reopened Result is past this decision");

// --- Sleep position carries over in the Mbolster flow's words ---
assert.equal(bolsterSleepPosition("side"), "side");
assert.equal(bolsterSleepPosition("stomach"), "stomach");
assert.equal(bolsterSleepPosition("back"), "other");
assert.equal(bolsterSleepPosition("mixed"), "other");

// --- Step 2 sends the shopper back to the Mpillow's step 3 ---
assert.equal(pairedDetailsPath("/mp-config"), "/mp-config?paired=details");
assert.equal(opensPairedDetails("?paired=details"), true);
assert.equal(opensPairedDetails("?hold_cancelled=1"), false);

// --- The hand-off survives storage and refuses anything malformed ---
const bolster: PairedBolster = {
  responseId: "b",
  suggestedLength: "medium",
  measurements: { height_cm: 170, sleep_position: "side" },
  preferenceLines: [{ item_id: 42, quantity: 1, category: "case" }],
  addonLines: [],
};
const summary = { label: "Mbolster · medium", lines: ["Case: Grey"], ballpark: 120, currency: "SGD" };
const handoff: PairedHandoff = {
  v: 2,
  anchorId: "a",
  companionId: "b",
  sleepPosition: "side",
  reason: "You already sleep with a bolster.",
  configPath: "/mp-config",
  pillow: { label: "Mpillow M · premium", ballpark: 360, currency: "SGD" },
};
const answered: PairedHandoff = { ...handoff, choice: { bolster, summary } };
assert.deepEqual(parsePairedHandoff(JSON.parse(JSON.stringify(handoff))), handoff, "round-trips");
assert.deepEqual(parsePairedHandoff(JSON.parse(JSON.stringify(answered))), answered, "an answered step 2 round-trips");
assert.deepEqual(
  parsePairedHandoff({ ...handoff, choice: { bolster: null } })?.choice,
  { bolster: null },
  "Skip round-trips",
);
assert.equal(
  parsePairedHandoff({ ...answered, choice: { bolster: { ...bolster, responseId: "other" }, summary } })?.choice,
  undefined,
  "an Mbolster for another companion is not this pair's answer",
);
assert.equal(parsePairedHandoff({ ...handoff, v: 1 }), null, "the v1 hand-off (contact before the Mbolster) is refused");
assert.equal(parsePairedHandoff({ ...handoff, configPath: "https://evil.test" }), null, "only a local return path");
assert.equal(parsePairedHandoff({ ...handoff, companionId: "" }), null, "needs a companion id");
assert.equal(parsePairedHandoff({ ...handoff, anchorId: "" }), null, "needs an anchor id");

// --- A new anchor (a cancelled Checkout) mints a new companion, answers kept ---
assert.equal(reanchorPairedHandoff(answered, "a", () => "x"), answered, "same anchor: untouched");
const moved = reanchorPairedHandoff(answered, "a2", () => "b2");
assert.equal(moved.anchorId, "a2");
assert.equal(moved.companionId, "b2");
assert.equal(moved.choice?.bolster?.responseId, "b2", "the held Mbolster follows the new companion id");
assert.deepEqual(moved.choice?.bolster?.preferenceLines, bolster.preferenceLines, "and keeps its answers");
assert.deepEqual(reanchorPairedHandoff({ ...handoff, choice: { bolster: null } }, "a2", () => "b2").choice, { bolster: null });

// --- One request for both; Skip sends the pillow alone. The route is answered either way ---
const pendingRecord = {
  flow: "premium-mpillow",
  size: "M",
  flowRoute: { targetFlow: "mbolster", reason: "You already sleep with a bolster.", nodeId: "route-mbolster" },
  flowRouteDecision: "pending",
};
const pillowHold = { responseId: "a", suggestedSize: "M", email: "ada@x.test", recommendationRecord: pendingRecord };
const withBolster = pairedHoldBody(pillowHold, bolster);
assert.deepEqual(withBolster.pairedBolster, bolster, "Add carries the Mbolster");
assert.equal(withBolster.suggestedSize, "M", "the Mpillow's own body is sent unchanged");
assert.equal(withBolster.email, "ada@x.test", "with the contact step 3 collected");
assert.equal(
  (withBolster.recommendationRecord as { flowRouteDecision: string }).flowRouteDecision,
  "accepted",
  "Add accepts the route",
);
const skipped = pairedHoldBody(pillowHold, null);
assert.equal(skipped.pairedBolster, undefined, "Skip sends no Mbolster");
assert.equal(
  (skipped.recommendationRecord as { flowRouteDecision: string }).flowRouteDecision,
  "declined",
  "Skip declines the route, so the hold gate passes",
);

// --- Wiring: both builds first, then details, then the review that pays ---
const mp = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
assert.match(
  mp,
  /\{phase \? \(\s*<PairedStepperBar\s+className="border-t"\s+step=\{phase === "customize" \? 1 : phase === "details" \? 3 : 4\}[\s\S]{0,200}<\/header>/,
  "steps 1, 3 and 4 along the top of the Mpillow page, in its sticky header",
);
assert.doesNotMatch(mp, /<PairedStepper\s/, "and only there");
assert.match(mp, /writePairedHandoff\(window\.sessionStorage/, "Next: Mbolster writes the hand-off");
assert.match(mp, /router\.push\(withLocale\(PAIRED_MBOLSTER_PATH, locale\)\)/, "and goes to the Mbolster page");
assert.match(mp, /askingDetails && !resumeFinish && !staffEdit && \(/, "contact waits for step 3");
assert.match(mp, /\{askingDetails && \(\s*<HoldShippingFields/, "and so does shipping");
assert.match(mp, /\{phase === "review" \? pairedReview : null\}/, "step 4 is the summary");
assert.match(mp, /handleAuthorizeHold\(\{ paired: pairedChoice/, "and the hold is sent from it");
assert.match(mp, /phase === "review" && !preOrder\s*\? "Pay"/, "its button says Pay");
assert.match(mp, /pairedHoldBody\(holdBody, bolster\)/, "one request for both builds");
assert.match(mp, /pairedFlow && pairedChoice\?\.bolster \? SHIPS_AS_PAIR/, "a pair's shipping is quoted for both boxes");
assert.match(mp, /record\.flowRoute\.targetFlow !== "mbolster"/, "no Upsell card for an Mbolster route");
assert.match(mp, /r\.flowRoute\?\.targetFlow !== "mbolster"/, "a pending Mbolster route never blocks the hold");

const mb = readFileSync("app/[lang]/mbolster-config/mbolster-config-client.tsx", "utf8");
assert.match(mb, /<PairedStepperBar className="border-t" step=\{2\} \/> : null\}\s*<\/header>/, "step 2 along the top of the Mbolster's customisation page");
// Sticky the way the configurator header is (#399): its class is the shared
// `configuratorStickyHeaderClassName`, itself checked to be `sticky top-0`.
assert.match(
  mb,
  /\{paired \? \(\s*<PairedStepperBar\s+className=\{cn\(\s*configuratorStickyHeaderClassName,/,
  "and above its height step, sticky like the configurator header",
);
assert.doesNotMatch(mb, /<PairedStepper\s/, "and only there");
assert.match(mb, /nextStep: "preview"/, "paired: height goes straight to the customisation page");
assert.match(mb, /if \(pairedHandoffOnPage\(\)\) return;/, "a paired run never overwrites the standalone draft");
assert.match(mb, /router\.push\(to\(pairedDetailsPath\(paired\.configPath\)\)\)/, "its answer goes back to the Mpillow's step 3");
assert.match(mb, /handlePairedChoice\(false\)/, "Skip goes on without the Mbolster");
assert.doesNotMatch(mb, /\/api\/results\/hold[\s\S]*pairedHoldBody|pairedHoldBody\(/, "step 2 never pays");

console.log("paired-mbolster self-check ok");
