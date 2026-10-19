/**
 * Paired build stepper self-check (ADR 0026).
 * Run: npx tsx lib/configurator/paired-mbolster.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  newPairedMbolsterDraft,
  pairedBolsterPayload,
  runsPairedStepper,
} from "./paired-mbolster";

// --- Who gets the stepper: a card-holding shopper whose graph routes to Mbolster ---
const base = { routeTarget: "mbolster" as const, assisted: false, partnerAssisted: false, reopened: false };
assert.equal(runsPairedStepper(base), true, "Mbolster route on a plain hold → stepper");
assert.equal(runsPairedStepper({ ...base, routeTarget: "premium-mpillow" }), false, "an upgrade route is the Upsell card's");
assert.equal(runsPairedStepper({ ...base, routeTarget: null }), false, "no route, no stepper");
assert.equal(runsPairedStepper({ ...base, assisted: true }), false, "an Assisted customisation is sent without a finish");
assert.equal(runsPairedStepper({ ...base, partnerAssisted: true }), false, "partner runs see no upsells");
assert.equal(runsPairedStepper({ ...base, reopened: true }), false, "a reopened Result is past this decision");

// --- The hold payload exists only once step 2 has a length and a case ---
const draft = newPairedMbolsterDraft("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
assert.equal(pairedBolsterPayload(draft, "side"), null, "empty draft → nothing to hold");
assert.equal(
  pairedBolsterPayload({ ...draft, heightCm: "170", length: "medium" }, "side"),
  null,
  "no case yet → nothing to hold",
);
assert.deepEqual(
  pairedBolsterPayload({ ...draft, heightCm: "170", length: "medium", caseId: 42 }, "side"),
  {
    responseId: draft.responseId,
    suggestedLength: "medium",
    measurements: { height_cm: 170, sleep_position: "side" },
    preferenceLines: [{ item_id: 42, quantity: 1, category: "case" }],
  },
  "complete step 2 → the hold's pairedBolster",
);

// --- Wiring in the Mpillow configurator ---
const mp = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
assert.match(mp, /<PairedStepper step=\{pairStep\} \/>/, "stepper header renders");
assert.match(mp, /<PairedMbolsterStep/, "step 2 panel renders");
assert.match(mp, /pairedBolster: opts\.pairedBolster/, "Add Mbolster sends the companion with the hold");
assert.match(
  mp,
  /record\.flowRoute\.targetFlow !== "mbolster"/,
  "the Upsell card never offers an Mbolster 'upgrade' it cannot perform",
);
assert.match(
  mp,
  /r\.flowRoute\?\.targetFlow !== "mbolster"/,
  "a pending Mbolster route never blocks the hold — step 2 or Skip answers it",
);
assert.match(mp, /withJourneyOnDecline\(parsedRecord\)/, "Skip records the route as declined");

console.log("paired-mbolster self-check ok");
