/**
 * Slice 10: MeasureTile stacks diagram above text.
 * Run: npx tsx components/ui/measure-tile.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const carousel = readFileSync(join(ROOT, "components/ui/apple-cards-carousel.tsx"), "utf8");
const slideIn = readFileSync(
  join(ROOT, "components/slide-in-pages/size-matters-slide-in.tsx"),
  "utf8",
);

const tile = carousel.match(
  /export function MeasureTile\([\s\S]*?\n\}/,
)?.[0];
assert.ok(tile, "MeasureTile export present");
assert.match(tile, /flex flex-col/);
assert.doesNotMatch(tile, /items-start gap-3/);
assert.match(tile, /max-w-\[150px\]/);
assert.match(tile, /\{title\}/);
assert.match(tile, /\{description\}/);

assert.equal([...slideIn.matchAll(/<MeasureTile\b/g)].length, 4);

console.log("measure-tile.check.ts: ok");
