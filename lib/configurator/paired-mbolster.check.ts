/**
 * Paired build stepper self-check (ADR 0026).
 * Run: npx tsx lib/configurator/paired-mbolster.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  bolsterSleepPosition,
  pairedHoldBody,
  parsePairedHandoff,
  runsPairedStepper,
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

// --- The hand-off survives storage and refuses anything malformed ---
const pendingRecord = {
  flow: "premium-mpillow",
  size: "M",
  flowRoute: { targetFlow: "mbolster", reason: "You already sleep with a bolster.", nodeId: "route-mbolster" },
  flowRouteDecision: "pending",
};
const handoff: PairedHandoff = {
  v: 1,
  pillowHold: { responseId: "a", suggestedSize: "M", recommendationRecord: pendingRecord },
  companionId: "b",
  sleepPosition: "side",
  reason: "You already sleep with a bolster.",
  configPath: "/mp-config",
  pillow: { label: "Mpillow M · premium", ballpark: 360, currency: "SGD" },
};
assert.deepEqual(parsePairedHandoff(JSON.parse(JSON.stringify(handoff))), handoff, "round-trips");
assert.equal(parsePairedHandoff({ ...handoff, v: 2 }), null, "unknown version refused");
assert.equal(parsePairedHandoff({ ...handoff, configPath: "https://evil.test" }), null, "only a local return path");
assert.equal(parsePairedHandoff({ ...handoff, companionId: "" }), null, "needs a companion id");

// --- One request for both; Skip sends the pillow alone. The route is answered either way ---
const bolster = {
  responseId: "b",
  suggestedLength: "medium",
  measurements: { height_cm: 170, sleep_position: "side" as const },
  preferenceLines: [{ item_id: 42, quantity: 1, category: "case" as const }],
  addonLines: [],
};
const withBolster = pairedHoldBody(handoff, bolster);
assert.deepEqual(withBolster.pairedBolster, bolster, "Add carries the Mbolster");
assert.equal(withBolster.suggestedSize, "M", "the Mpillow's own body is sent unchanged");
assert.equal(
  (withBolster.recommendationRecord as { flowRouteDecision: string }).flowRouteDecision,
  "accepted",
  "Add accepts the route",
);
const skipped = pairedHoldBody(handoff, null);
assert.equal(skipped.pairedBolster, undefined, "Skip sends no Mbolster");
assert.equal(
  (skipped.recommendationRecord as { flowRouteDecision: string }).flowRouteDecision,
  "declined",
  "Skip declines the route, so the hold gate passes",
);

// --- Wiring: the Mpillow hands over, the Mbolster page asks height only ---
const mp = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
assert.match(mp, /<PairedStepper step=\{1\} \/>/, "step 1 header on the Mpillow preview");
assert.match(mp, /writePairedHandoff\(window\.sessionStorage/, "Next: Mbolster writes the hand-off");
assert.match(mp, /"\/mbolster-config\?paired=1"/, "and goes to the Mbolster page");
assert.match(mp, /record\.flowRoute\.targetFlow !== "mbolster"/, "no Upsell card for an Mbolster route");
assert.match(mp, /r\.flowRoute\?\.targetFlow !== "mbolster"/, "a pending Mbolster route never blocks the hold");

const mb = readFileSync("app/[lang]/mbolster-config/mbolster-config-client.tsx", "utf8");
assert.match(mb, /<PairedStepper step=\{2\} \/>/, "step 2 header on the Mbolster page");
assert.match(mb, /nextStep: "preview"/, "paired: height goes straight to the customisation page");
assert.match(mb, /if \(pairedHandoffOnPage\(\)\) return;/, "a paired run never overwrites the standalone draft");
assert.match(mb, /pairedHoldBody\(/, "one request for both builds");
assert.match(mb, /handlePairedHold\(false\)/, "Skip holds the Mpillow alone");

console.log("paired-mbolster self-check ok");
