/**
 * Self-check: measurement draft normalize/display via rules-engine units.
 * Run: npx tsx lib/configurator/measurement-draft.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  displayMeasurement,
  normalizeMeasurementDraft,
} from "./measurement-draft";
import {
  CM_PER_INCH,
  HEAD_TO_BACK_MIN_CM,
  inchesToCm,
  roundCm,
} from "@/lib/rules-engine/units";

// Incomplete trailing decimal — keep invalid so Continue stays gated
assert.equal(normalizeMeasurementDraft("in", "16."), null);
assert.equal(normalizeMeasurementDraft("cm", "42."), null);
assert.equal(normalizeMeasurementDraft("in", ""), null);
assert.equal(normalizeMeasurementDraft("cm", "abc"), null);
assert.equal(normalizeMeasurementDraft("in", "0"), null);

// Head-to-back passes its floor: 0 is a real answer, down to −3 in
assert.equal(normalizeMeasurementDraft("in", "0", HEAD_TO_BACK_MIN_CM), "0");
assert.equal(normalizeMeasurementDraft("in", "-3", HEAD_TO_BACK_MIN_CM), "-7.62");
assert.equal(normalizeMeasurementDraft("in", "-3.01", HEAD_TO_BACK_MIN_CM), null);

// Complete values → canonical cm
assert.equal(normalizeMeasurementDraft("in", "16.5"), String(roundCm(inchesToCm(16.5))));
assert.equal(normalizeMeasurementDraft("cm", "42"), "42");
assert.equal(normalizeMeasurementDraft("cm", "42.25"), "42.25");

// Display round-trip from committed cm
assert.equal(displayMeasurement("cm", "41.91"), "41.91");
assert.equal(displayMeasurement("in", String(16.5 * CM_PER_INCH)), "16.5");
assert.equal(displayMeasurement("in", ""), "");

const mp = readFileSync(
  join(process.cwd(), "app/[lang]/mp-config/mp-config-client.tsx"),
  "utf8",
);
assert.match(mp, /useState<MeasurementUnit>\("in"\)/);
assert.match(mp, /TabsTrigger value="in"/);
assert.match(mp, /TabsTrigger value="cm"/);

console.log("measurement-draft.check.ts: ok");
