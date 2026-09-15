/**
 * Issue #65: rules-engine workbench mobile stacking (token asserts).
 * Run: npx tsx components/rules-engine/workbench-mobile.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(
  join(ROOT, "components/rules-engine/workbench.tsx"),
  "utf8",
);

// Canvas keeps a usable height on phones.
assert.match(src, /max-md:min-h-\[60dvh\]/, "expected mobile canvas height");

// Tools live in the Admin Panel dock; nothing is docked beside the canvas.
assert.match(src, /useDockActions\(/, "expected tools registered in the app dock");
assert.doesNotMatch(src, /<aside/, "expected no side panel eating canvas width");

// Cards open on demand, sit above the measured dock, and span the phone width.
assert.match(src, /\{panel \? \(/, "expected the card to render only when open");
assert.match(src, /setPanel\(null\)/, "expected cards to close");
assert.match(
  src,
  /fixed inset-x-2 bottom-\[calc\(var\(--mobile-dock-height\)/,
  "expected the card to clear the dock as a full-width sheet on phones",
);

// The dock covers the canvas bottom on phones: controls move up, minimap goes.
assert.match(src, /position=\{isMobile \? "top-left"/, "expected mobile controls at top");

console.log("workbench-mobile.check.ts: ok");
