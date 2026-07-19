/**
 * Slice 04 self-check: inches default, catalog-required gating, no silent defaults.
 * Run: npx tsx lib/rules-engine/slice-04.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { catalogKeys, inputCatalog, missingRequiredInputs } from "./catalog";
import {
  basicBodyToEngineInputs,
  incompleteEngineInputs,
  measurementPrefsToEngineInputs,
  wizardToEngineInputs,
  type WizardMeasurementData,
} from "./legacy-inputs";
import { cmToInches, inchesToCm, roundCm } from "./units";
import { premiumSampleInputs } from "./fixtures";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- Units round-trip (canonical cm) ---
assert.equal(roundCm(inchesToCm(16.5)), roundCm(16.5 * 2.54));
assert.equal(Math.round(cmToInches(inchesToCm(16.5)) * 100) / 100, 16.5);

// --- Catalog: every flow key is required ---
for (const flow of ["premium-mpillow", "basic-mpillow", "mbolster"] as const) {
  const keys = [...catalogKeys(flow)];
  assert.ok(keys.length > 0, `${flow} has catalog keys`);
  assert.deepEqual(
    missingRequiredInputs(flow, {}),
    keys,
    `${flow}: empty inputs → all keys missing`,
  );
  const complete =
    flow === "mbolster"
      ? { height_cm: 170 }
      : flow === "basic-mpillow"
        ? (() => {
            const full = premiumSampleInputs();
            const basic: Record<string, unknown> = {};
            for (const k of keys) basic[k] = full[k];
            return basic;
          })()
        : premiumSampleInputs();
  assert.deepEqual(missingRequiredInputs(flow, complete), []);
}

// Premium catalog includes the four measurements + customize answers
const premiumKeys = catalogKeys("premium-mpillow");
for (const k of [
  "shoulder_length_cm",
  "neck_to_back_cm",
  "head_to_back_cm",
  "neck_length_cm",
  "sleep_pain_areas",
  "sleep_position",
  "gender",
  "age_group",
]) {
  assert.ok(premiumKeys.has(k), `premium catalog has ${k}`);
}
assert.ok(catalogKeys("basic-mpillow").has("shoulder_length_cm"));
assert.ok(!catalogKeys("basic-mpillow").has("neck_to_back_cm"));
assert.deepEqual([...catalogKeys("mbolster")], ["height_cm"]);

// --- Wizard / API mappers feed missingRequiredInputs ---
const emptyWizard: WizardMeasurementData = {
  shoulderLength: "",
  neckToBack: "",
  headToBack: "",
  neckLength: "",
  gender: "",
  ageGroup: "",
  bloodPressureLevel: "",
  earDiscomfortSideSleep: "",
  bedFirmness: "",
  acidReflux: "",
  sleepPainAreas: [],
  sleepPositionType: [],
  usesBolster: "",
};
assert.ok(
  incompleteEngineInputs("premium-mpillow", wizardToEngineInputs(emptyWizard)).length > 0,
);
assert.ok(
  incompleteEngineInputs("basic-mpillow", wizardToEngineInputs(emptyWizard)).includes(
    "shoulder_length_cm",
  ),
);

const fullWizard: WizardMeasurementData = {
  shoulderLength: "42",
  neckToBack: "10",
  headToBack: "12",
  neckLength: "10",
  gender: "female",
  ageGroup: "35-44",
  bloodPressureLevel: "normal",
  earDiscomfortSideSleep: "no",
  bedFirmness: "medium",
  acidReflux: "no",
  sleepPainAreas: ["none"],
  sleepPositionType: ["side"],
  usesBolster: "no",
};
assert.deepEqual(
  incompleteEngineInputs("premium-mpillow", wizardToEngineInputs(fullWizard)),
  [],
);
assert.deepEqual(
  incompleteEngineInputs("basic-mpillow", wizardToEngineInputs(fullWizard)),
  [],
);

// Empty pain areas / sleep position → missing catalog keys
const noPain = { ...fullWizard, sleepPainAreas: [] };
assert.ok(
  incompleteEngineInputs("premium-mpillow", wizardToEngineInputs(noPain)).includes(
    "sleep_pain_areas",
  ),
);
const noSleep = { ...fullWizard, sleepPositionType: [] };
assert.ok(
  incompleteEngineInputs("premium-mpillow", wizardToEngineInputs(noSleep)).includes(
    "sleep_position",
  ),
);

// measurement prefs mapper (customize API shape)
const prefs = {
  measurements: {
    shoulder_length_cm: 42,
    neck_to_back_cm: 10,
    head_to_back_cm: 12,
    neck_length_cm: 10,
  },
  demographics: { gender: "female", age_group: "35-44" },
  health: {
    blood_pressure: "normal",
    ear_discomfort_side_sleep: false,
    bed_firmness: "medium",
    acid_reflux: false,
    sleep_pain_areas: [] as string[],
    sleep_position_type: ["side"],
    uses_bolster: false,
  },
};
assert.ok(
  incompleteEngineInputs(
    "premium-mpillow",
    measurementPrefsToEngineInputs(prefs),
  ).includes("sleep_pain_areas"),
);
prefs.health.sleep_pain_areas = ["none"];
assert.deepEqual(
  incompleteEngineInputs("premium-mpillow", measurementPrefsToEngineInputs(prefs)),
  [],
);

assert.ok(
  incompleteEngineInputs(
    "basic-mpillow",
    basicBodyToEngineInputs({ shoulderLength: "42" }),
  ).length > 0,
);

// --- Client wiring: no silent defaults; inches default; required pain; photos optional ---
const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.doesNotMatch(mp, /shoulderCm\s*\|\|\s*40/);
assert.doesNotMatch(mp, /\|\|\s*8\b/);
assert.doesNotMatch(mp, /headToBackCm\s*\|\|\s*10|neckLengthCm\s*\|\|\s*10/);
assert.match(mp, /useState<MeasurementUnit>\("in"\)/);
assert.match(mp, /incompleteEngineInputs/);
assert.match(mp, /wizardToEngineInputs/);
assert.match(mp, /key: "sleepPainAreas"/);
assert.match(mp, /togglePainArea/);
assert.match(mp, /Photos[\s\S]*?\(optional\)/);
assert.doesNotMatch(mp, /Prefetch basic recommendation/);

// Measurement guides present on each measurement step card
assert.match(mp, /shoulder-length\.svg/);
assert.match(mp, /neck-to-back\.svg/);
assert.match(mp, /head-to-back\.svg/);
assert.match(mp, /neck-length\.svg/);

// Server gates
const customize = read("app/api/shop/customize/route.ts");
assert.match(customize, /incompleteEngineInputs/);
assert.match(customize, /measurementPrefsToEngineInputs/);
assert.match(customize, /Incomplete engine inputs/);

const basicApi = read("app/api/mp-basic/recommend/route.ts");
assert.match(basicApi, /incompleteEngineInputs/);
assert.match(basicApi, /basicBodyToEngineInputs/);
assert.match(basicApi, /sleepPainAreas: z\.array\(z\.string\(\)\)\.min\(1\)/);

const bolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.match(bolster, /heightUnit: "in"/);
assert.match(bolster, /TabsTrigger value="in"/);

// Catalog inputDefs still list none for pain areas
assert.ok(
  inputCatalog("premium-mpillow")
    .find((d) => d.key === "sleep_pain_areas")
    ?.values?.includes("none"),
);

console.log("slice-04.check.ts: ok");
