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

// Panels stack vertically on mobile so the canvas gets full width.
assert.match(src, /max-md:flex-col/, "expected max-md:flex-col stacking");

// Canvas keeps a usable height when stacked.
assert.match(src, /max-md:min-h-\[60dvh\]/, "expected mobile canvas height");

// Inspector is collapsible on mobile (toggle state + drawer, not always-on).
assert.match(src, /inspectorOpen/, "expected inspectorOpen state");
assert.match(src, /setInspectorOpen/, "expected inspector toggle setter");
assert.match(
  src,
  /max-md:hidden/,
  "expected inspector hidden on mobile when collapsed",
);
assert.match(
  src,
  /max-md:fixed[\s\S]*max-md:bottom-0/,
  "expected inspector to render as a bottom drawer overlay on mobile",
);

console.log("workbench-mobile.check.ts: ok");
