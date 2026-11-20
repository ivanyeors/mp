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

assert.equal(normalizeMeasurementDraft("in", "16."), null);
assert.equal(normalizeMeasurementDraft("cm", "42."), null);
assert.equal(normalizeMeasurementDraft("in", ""), null);
assert.equal(normalizeMeasurementDraft("cm", "abc"), null);
assert.equal(normalizeMeasurementDraft("in", "0"), null);

assert.equal(normalizeMeasurementDraft("in", "0", HEAD_TO_BACK_MIN_CM), "0");
assert.equal(normalizeMeasurementDraft("in", "-3", HEAD_TO_BACK_MIN_CM), "-7.62");
assert.equal(normalizeMeasurementDraft("in", "-3.01", HEAD_TO_BACK_MIN_CM), null);

assert.equal(normalizeMeasurementDraft("in", "16.5"), String(roundCm(inchesToCm(16.5))));
assert.equal(normalizeMeasurementDraft("cm", "42"), "42");
assert.equal(normalizeMeasurementDraft("cm", "42.25"), "42.25");

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
