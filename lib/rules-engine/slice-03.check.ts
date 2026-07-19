/**
 * Slice 03 wiring self-check — mount points + contracts.
 * Run: npx tsx lib/rules-engine/slice-03.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assertPublishable } from "./validate";
import { basicSeedGraph, mbolsterSeedGraph, premiumSeedGraph } from "./seeds";
import { evaluateOrThrow } from "./evaluate";
import { legacyShoulderSize } from "./recommend";

const ROOT = join(import.meta.dirname, "../..");

function src(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const mig = "supabase/migrations/20260719200000_recommendation_record.sql";
assert.ok(existsSync(join(ROOT, mig)), "recommendation_record migration exists");
assert.match(src(mig), /recommendation_record/);

assert.match(src("app/api/shop/customize/route.ts"), /getSizeBallparkFromMeasurements/);
assert.match(src("app/api/mp-basic/recommend/route.ts"), /recommendWithEngine/);
assert.match(src("app/api/mp-config/responses/[id]/route.ts"), /recommendWithEngine/);
assert.match(src("app/api/results/hold/route.ts"), /recommendation_record/);
assert.match(src("lib/rules-engine/recommend.ts"), /ponytail: bootstrap guard/);
assert.match(src("scripts/seed-rule-graphs.ts"), /premiumSeedGraph/);
assert.ok(
  !src("app/[lang]/mp-maker/page.tsx").includes("recommendWithEngine"),
  "mp-maker stays on legacy FILLING_SPECS path",
);

const tpl = { XS: "1", S: "2", M: "3", L: "4", XL: "5" };
const premium = premiumSeedGraph(tpl);
assert.equal(assertPublishable("premium-mpillow", premium).ok, true);
const size = evaluateOrThrow("premium-mpillow", premium, {
  shoulder_length_cm: 36,
  neck_to_back_cm: 10,
  head_to_back_cm: 12,
  neck_length_cm: 10,
}).size;
assert.equal(size, legacyShoulderSize(36));
assert.equal(size, "XS");

assert.equal(assertPublishable("basic-mpillow", basicSeedGraph(tpl)).ok, true);
assert.equal(
  assertPublishable(
    "mbolster",
    mbolsterSeedGraph({ short: "a", medium: "b", long: "c" }),
  ).ok,
  true,
);

console.log("slice-03.check.ts: ok");
