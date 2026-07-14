/**
 * Self-check: measurement draft normalize/display (decimal typing).
 * Run: npx tsx lib/configurator/measurement-draft.check.ts
 */
import assert from "node:assert/strict";

import {
  displayMeasurement,
  normalizeMeasurementDraft,
} from "./measurement-draft";

// Incomplete trailing decimal — keep invalid so Continue stays gated
assert.equal(normalizeMeasurementDraft("in", "16."), null);
assert.equal(normalizeMeasurementDraft("cm", "42."), null);
assert.equal(normalizeMeasurementDraft("in", ""), null);
assert.equal(normalizeMeasurementDraft("cm", "abc"), null);
assert.equal(normalizeMeasurementDraft("in", "0"), null);

// Complete values
assert.equal(normalizeMeasurementDraft("in", "16.5"), String(Math.round(16.5 * 2.54 * 100) / 100));
assert.equal(normalizeMeasurementDraft("cm", "42"), "42");
assert.equal(normalizeMeasurementDraft("cm", "42.25"), "42.25");

// Display round-trip from committed cm
assert.equal(displayMeasurement("cm", "41.91"), "41.91");
assert.equal(displayMeasurement("in", String(16.5 * 2.54)), "16.5");
assert.equal(displayMeasurement("in", ""), "");

console.log("measurement-draft.check.ts: ok");
