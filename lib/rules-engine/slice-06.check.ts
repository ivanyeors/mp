import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  carryOverAnswers,
  FLOW_ROUTE_EXPECTATION,
  missingStepsAfterCarryOver,
} from "./carry-over";
import {
  assertPreStripeRouteResolved,
  isFlowRoutePending,
  withJourneyOnDecline,
} from "./journey";
import type { RecommendationRecord } from "./recommendation-record";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

for (const rel of [
  "lib/rules-engine/carry-over.ts",
  "lib/rules-engine/journey.ts",
  "components/rules-engine/upsell-card.tsx",
  "components/rules-engine/tier-suggestion.tsx",
]) {
  assert.ok(existsSync(join(ROOT, rel)), `${rel} exists`);
}

assert.deepEqual(
  carryOverAnswers("mbolster", "premium-mpillow", { height_cm: 170 }),
  {},
);
assert.ok(FLOW_ROUTE_EXPECTATION.includes("2 minute"));
assert.deepEqual(
  missingStepsAfterCarryOver("mbolster", "basic-mpillow", {}),
  ["age", "health", "shoulder-length", "photos"],
);

const pendingRecord = (): RecommendationRecord => ({
  graphVersionId: "g1",
  flow: "mbolster",
  entryFlow: "mbolster",
  finalFlow: "mbolster",
  size: "medium",
  templateId: "1",
  tierSuggestion: null,
  soldTier: null,
  flowRoute: {
    targetFlow: "premium-mpillow",
    reason: "Try Mpillow",
    nodeId: "route-1",
  },
  flowRouteDecision: "pending",
  firedTerminals: [],
  trace: [],
  usedFallback: false,
  usedLegacyBootstrap: false,
});

assert.equal(isFlowRoutePending(pendingRecord()), true);
assert.equal(
  assertPreStripeRouteResolved(pendingRecord()).ok,
  false,
);
assert.equal(
  assertPreStripeRouteResolved(withJourneyOnDecline(pendingRecord())).ok,
  true,
);

const bolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.match(bolster, /UpsellCard/);
assert.match(bolster, /assertPreStripeRouteResolved/);
assert.match(bolster, /mp_flow_route_handoff/);

const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.match(mp, /UpsellCard/);
assert.match(mp, /assertPreStripeRouteResolved/);
assert.match(mp, /withJourneyOnAccept/);
assert.match(mp, /mp_flow_route_handoff/);

const hold = read("app/api/results/hold/route.ts");
assert.match(hold, /assertPreStripeRouteResolved/);
assert.match(hold, /recommendationRecord/);

const basicRec = read("app/api/mp-basic/recommend/route.ts");
assert.match(basicRec, /basicBodyToEngineInputs\(parsed\.data\)/);

console.log("rules-engine slice 06 self-check ok");
