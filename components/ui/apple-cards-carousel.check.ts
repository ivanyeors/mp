/**
 * Issue #61: carousel arrow contrast + scroll-snap (token asserts).
 * Run: npx tsx components/ui/apple-cards-carousel.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "components/ui/apple-cards-carousel.tsx"), "utf8");

// Scroll-snap: track is snap-mandatory, cards snap-start.
assert.match(src, /snap-x snap-mandatory/);
assert.match(src, /snap-start/);

// Arrows use semantic theme tokens (visible in light + dark).
assert.match(src, /text-foreground/);
assert.match(src, /bg-background\/80/);

// Arrow buttons carry no hardcoded gray. Scope to the nav-arrow block so the
// unrelated card-body bg-gray-100 (left intentionally untouched) doesn't trip us.
const arrowBlock = src.slice(src.indexOf("flex justify-end gap-2"), src.indexOf("</CarouselContext.Provider>"));
assert.doesNotMatch(arrowBlock, /bg-gray-100/);
assert.doesNotMatch(arrowBlock, /text-gray-500/);
// No hardcoded hex color on the arrows.
assert.doesNotMatch(arrowBlock, /#[0-9a-fA-F]{3,6}\b/);

// Mobile trailing spacer trimmed (was last:pr-[5%]).
assert.doesNotMatch(src, /last:pr-\[5%\]/);
assert.match(src, /max-md:mr-0/);

console.log("apple-cards-carousel.check.ts: ok");
