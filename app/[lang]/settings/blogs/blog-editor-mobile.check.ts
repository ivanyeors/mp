/**
 * Issues #68 (responsive MDEditor) + #56 (zoom-safe blog inputs) — token asserts.
 * Run: npx tsx "app/[lang]/settings/blogs/blog-editor-mobile.check.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(
  join(ROOT, "app/[lang]/settings/blogs/[id]/blog-editor-client.tsx"),
  "utf8",
);

// #56: raw inputs/textarea/select are ≥16px on mobile (no iOS focus-zoom).
assert.match(src, /text-sm max-md:text-base/, "expected max-md:text-base on raw inputs");
// Every raw field that had text-sm now pairs it with max-md:text-base.
const textSm = (src.match(/\btext-sm\b/g) ?? []).length;
const zoomSafe = (src.match(/text-sm max-md:text-base/g) ?? []).length;
assert.ok(
  zoomSafe >= 9,
  `expected all raw inputs zoom-safe (got ${zoomSafe} of ${textSm} text-sm)`,
);

// #68: MDEditor height is responsive (useIsMobile-driven).
assert.match(src, /useIsMobile/, "expected useIsMobile import/usage");
assert.match(
  src,
  /height=\{isMobile \? "60dvh" : 500\}/,
  "expected mobile-driven MDEditor height",
);
// #68: toolbar reduced on mobile so it doesn't overflow.
assert.match(
  src,
  /commands=\{isMobile \? MOBILE_MD_COMMANDS : undefined\}/,
  "expected reduced mobile toolbar commands",
);

console.log("blog-editor-mobile.check.ts: ok");
