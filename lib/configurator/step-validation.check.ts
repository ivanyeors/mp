/**
 * Slice 03 self-check: hybrid CTA + field error map.
 * Run: npx tsx lib/configurator/step-validation.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFieldErrorMap,
  hybridCtaEnabled,
  isNonEmptyString,
  isPositiveNumberString,
  pruneFieldErrors,
  type FieldCheck,
} from "./step-validation";

// Sample name step (empty → disabled)
const emptyName: FieldCheck[] = [
  { key: "name", touched: false, valid: false, message: "Enter your name" },
  { key: "gender", touched: false, valid: false, message: "Select a gender" },
  { key: "ageGroup", touched: false, valid: false, message: "Select an age group" },
];
assert.equal(hybridCtaEnabled(emptyName), false);

// Partially filled → CTA enabled; submit still errors missing fields
const partialName: FieldCheck[] = [
  { key: "name", touched: true, valid: true, message: "Enter your name" },
  { key: "gender", touched: false, valid: false, message: "Select a gender" },
  { key: "ageGroup", touched: false, valid: false, message: "Select an age group" },
];
assert.equal(hybridCtaEnabled(partialName), true);
assert.deepEqual(buildFieldErrorMap(partialName), {
  gender: "Select a gender",
  ageGroup: "Select an age group",
});

// Fixing a field clears that error only
const afterGender: FieldCheck[] = [
  { key: "name", touched: true, valid: true },
  { key: "gender", touched: true, valid: true },
  { key: "ageGroup", touched: false, valid: false, message: "Select an age group" },
];
assert.deepEqual(
  pruneFieldErrors(
    { gender: "Select a gender", ageGroup: "Select an age group" },
    afterGender,
  ),
  { ageGroup: "Select an age group" },
);

// Measurement: touched but invalid (0) → CTA on, error on submit
const badMeasure: FieldCheck[] = [
  {
    key: "shoulderLength",
    touched: true,
    valid: isPositiveNumberString("0"),
    message: "Enter a valid measurement",
  },
];
assert.equal(hybridCtaEnabled(badMeasure), true);
assert.equal(isPositiveNumberString("0"), false);
assert.equal(isPositiveNumberString("42"), true);
assert.deepEqual(buildFieldErrorMap(badMeasure), {
  shoulderLength: "Enter a valid measurement",
});

assert.equal(isNonEmptyString("  "), false);
assert.equal(isNonEmptyString("Ada"), true);

// Complete step → no errors
const complete: FieldCheck[] = [
  { key: "name", touched: true, valid: true },
  { key: "gender", touched: true, valid: true },
  { key: "ageGroup", touched: true, valid: true },
];
assert.deepEqual(buildFieldErrorMap(complete), {});

// Clients wire helper
const ROOT = process.cwd();
const mp = readFileSync(join(ROOT, "app/[lang]/mp-config/mp-config-client.tsx"), "utf8");
const bolster = readFileSync(
  join(ROOT, "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);
const rows = readFileSync(
  join(ROOT, "components/configurator/single-select-option-rows.tsx"),
  "utf8",
);

for (const src of [mp, bolster]) {
  assert.match(src, /hybridCtaEnabled|buildFieldErrorMap|step-validation/);
  assert.match(src, /buildFieldErrorMap|fieldErrors|pruneFieldErrors/);
}
assert.match(mp, /invalid=\{|error=\{/);
assert.match(rows, /invalid/);
assert.match(rows, /text-destructive|error/);

console.log("step-validation.check.ts: ok");
