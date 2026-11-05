/**
 * Slice 10: MeasureTile stacks diagram above text.
 * Run: npx tsx components/ui/measure-tile.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const carousel = readFileSync(join(ROOT, "components/ui/apple-cards-carousel.tsx"), "utf8");
// Size Matters' measurement cards moved onto a section template; the icons are config.
const template = readFileSync(join(ROOT, "components/product-sections/measure-carousel-section.tsx"), "utf8");
const config = readFileSync(join(ROOT, "lib/product-slide-sections/configs/size-matters.ts"), "utf8");

const tile = carousel.match(
  /export function MeasureTile\([\s\S]*?\n\}/,
)?.[0];
assert.ok(tile, "MeasureTile export present");
assert.match(tile, /flex flex-col/);
assert.doesNotMatch(tile, /items-start gap-3/);
assert.match(tile, /max-w-\[150px\]/);
assert.match(tile, /\{title\}/);
assert.match(tile, /\{description\}/);

assert.match(template, /<MeasureTile\b/);
assert.equal([...config.matchAll(/"\/[a-z-]+\.svg"/g)].length, 4);

console.log("measure-tile.check.ts: ok");
