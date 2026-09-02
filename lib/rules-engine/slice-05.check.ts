/**
 * Slice 05 self-check: preview reveal gate + assign hint wiring.
 * Run: npx tsx lib/rules-engine/slice-05.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldRevealRecommendation } from "./reveal";
import { plainLanguageWhy } from "./why";
import {
  resolveAssignHintTemplateId,
  selectAssignHintSource,
} from "./assign-hint";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- Reveal gate ---
assert.equal(
  shouldRevealRecommendation({ requiredInputsComplete: false }),
  false,
);
assert.equal(
  shouldRevealRecommendation({
    requiredInputsComplete: true,
    flowRouteUnresolved: true,
  }),
  false,
);
assert.equal(
  shouldRevealRecommendation({ requiredInputsComplete: true }),
  true,
);

// --- Why: no node ids ---
const why = plainLanguageWhy({
  size: "M",
  trace: [
    { nodeId: "in-shoulder", type: "input", detail: "shoulder_length_cm" },
    { nodeId: "sz-m", type: "size-output", detail: "band:M" },
  ],
  usedFallback: false,
  usedLegacyBootstrap: false,
}, { sleep_position: "side" });
assert.match(why, /Shoulder band M/);
assert.match(why, /Side sleeping/);
assert.match(why, /Size M/);
assert.doesNotMatch(why, /sz-m|in-shoulder/);

// --- Assign hint ---
assert.equal(
  selectAssignHintSource({
    engineTemplateId: 9,
    sizeScopeChanged: false,
    hasAssistFillingSnapshot: true,
  }),
  "engine",
);
assert.equal(
  resolveAssignHintTemplateId({
    engineTemplateId: 9,
    defaultTemplateId: 1,
    sizeScopeChanged: true,
    hasAssistFillingSnapshot: false,
  }),
  1,
);

// --- Mount / wiring ---
for (const rel of [
  "components/rules-engine/recommendation-reveal.tsx",
  "lib/rules-engine/reveal.ts",
  "lib/rules-engine/why.ts",
  "lib/rules-engine/assign-hint.ts",
]) {
  assert.ok(existsSync(join(ROOT, rel)), `${rel} exists`);
}

const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.match(mp, /RecommendationReveal/);
assert.match(mp, /shouldRevealRecommendation/);
assert.match(mp, /plainLanguageWhy/);

const bolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.match(bolster, /RecommendationReveal/);

// The results detail page is an RSC shell; the assign flow lives in the client component.
const assignPage = read("app/[lang]/settings/results/[id]/result-detail-client.tsx");
assert.match(assignPage, /resolveAssignHintTemplateId/);
assert.match(assignPage, /Engine recommendation|plainLanguageWhy/);
assert.match(assignPage, /Staff assist mix/);

const prep = read("lib/results/assign-prep.ts");
assert.match(prep, /preferredTemplateId/);
assert.match(prep, /hintSource/);

const prepRoute = read("app/api/results/assign/prep/route.ts");
assert.match(prepRoute, /preferredTemplateId/);

console.log("rules-engine slice 05 self-check ok");
