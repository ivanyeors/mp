/**
 * Slice 01 self-check: single-select rows + CTA copy.
 * Run: npx tsx components/configurator/single-select-option-rows.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AGE_GROUP_OPTIONS,
  BED_FIRMNESS_OPTIONS,
  BLOOD_PRESSURE_OPTIONS,
  GENDER_OPTIONS,
  SingleSelectOptionRows,
} from "./single-select-option-rows";

const ROOT = process.cwd();
const mp = readFileSync(join(ROOT, "app/[lang]/mp-config/mp-config-client.tsx"), "utf8");
const bolster = readFileSync(
  join(ROOT, "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);

// Shared control wired for all four former Selects
for (const token of [
  "SingleSelectOptionRows",
  "GENDER_OPTIONS",
  "AGE_GROUP_OPTIONS",
  "BLOOD_PRESSURE_OPTIONS",
  "BED_FIRMNESS_OPTIONS",
]) {
  assert.match(mp, new RegExp(token));
}

// No Select dropdown left in Mpillow wizard (was only used for these four)
assert.doesNotMatch(mp, /from "@\/components\/ui\/select"/);
assert.doesNotMatch(mp, /SelectTrigger|SelectItem|SelectValue/);

// CTA copy
assert.match(mp, /isBasic \? "Continue" : "Customise"/);
assert.doesNotMatch(mp, /Generate Results|See your Basic Mpillow/);

// Multi-select stays pill chips (rounded-full); pain areas use shared PAIN_AREA_OPTIONS
assert.match(mp, /PAIN_AREA_OPTIONS|sleepPainAreas[\s\S]*?rounded-full/);
assert.match(mp, /sleepPositionType[\s\S]*?rounded-full/);
assert.match(mp, /togglePainArea/);

// Yes/no Tabs unchanged for ear / acid / bolster
assert.match(mp, /earDiscomfortSideSleep[\s\S]*?<Tabs[\s\S]*?TabsTrigger value="yes"/);
assert.match(mp, /acidReflux[\s\S]*?<Tabs[\s\S]*?TabsTrigger value="yes"/);
assert.match(mp, /usesBolster[\s\S]*?<Tabs[\s\S]*?TabsTrigger value="yes"/);

// Mbolster: no demographics; advance CTAs stay Continue
assert.doesNotMatch(bolster, /gender|ageGroup|bloodPressure|bedFirmness|GENDER_OPTIONS/);
assert.match(bolster, />Continue</);
assert.doesNotMatch(bolster, /Generate Results|Customise(?! your Mbolster)/);

// Option catalogs match former Select values
assert.deepEqual(
  GENDER_OPTIONS.map((o) => o.value),
  ["female", "male"],
);
assert.deepEqual(
  AGE_GROUP_OPTIONS.map((o) => o.value),
  ["under-18", "18-24", "25-34", "35-44", "45-54", "55-64", "65-plus"],
);
assert.deepEqual(
  BLOOD_PRESSURE_OPTIONS.map((o) => o.value),
  ["normal", "low-blood", "high-blood", "unsure"],
);
assert.deepEqual(
  BED_FIRMNESS_OPTIONS.map((o) => o.value),
  ["soft", "medium-soft", "firm"],
);

// Single-select markup: one checked radio, cover-style border classes
const html = renderToStaticMarkup(
  createElement(SingleSelectOptionRows, {
    options: GENDER_OPTIONS,
    value: "male",
    onChange: () => {},
  }),
);
assert.match(html, /role="radiogroup"/);
assert.match(html, /aria-checked="true"[^>]*>[\s\S]*Male|Male[\s\S]*aria-checked="true"/);
assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
assert.equal((html.match(/aria-checked="false"/g) ?? []).length, 1);
assert.match(html, /border-primary/);

console.log("single-select-option-rows.check.ts: ok");
