/**
 * Self-check: pain-area None chip exclusivity + required answer.
 * Run: npx tsx lib/configurator/pain-areas.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAIN_AREA_NONE,
  PAIN_AREA_OPTIONS,
  painAreasAnswered,
  togglePainArea,
} from "./pain-areas";

assert.equal(painAreasAnswered([]), false);
assert.equal(painAreasAnswered(["none"]), true);
assert.equal(painAreasAnswered(["neck"]), true);

assert.deepEqual(togglePainArea([], PAIN_AREA_NONE), ["none"]);
assert.deepEqual(togglePainArea(["none"], PAIN_AREA_NONE), []);
assert.deepEqual(togglePainArea(["none"], "neck"), ["neck"]);
assert.deepEqual(togglePainArea(["neck", "shoulder"], PAIN_AREA_NONE), ["none"]);
assert.deepEqual(togglePainArea(["neck"], "neck"), []);
assert.deepEqual(togglePainArea(["neck"], "shoulder"), ["neck", "shoulder"]);

assert.ok(PAIN_AREA_OPTIONS.some((o) => o.value === "none" && o.label === "None"));

const mp = readFileSync(join(process.cwd(), "app/[lang]/mp-config/mp-config-client.tsx"), "utf8");
assert.match(mp, /togglePainArea/);
assert.match(mp, /PAIN_AREA_OPTIONS/);
assert.match(mp, /key: "sleepPainAreas"/);
assert.doesNotMatch(mp, /Select all that apply \(optional\)/);

console.log("pain-areas.check.ts: ok");
