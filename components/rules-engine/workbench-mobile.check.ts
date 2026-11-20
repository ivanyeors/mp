import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(
  join(ROOT, "components/rules-engine/workbench.tsx"),
  "utf8",
);

assert.match(src, /max-md:min-h-\[60dvh\]/, "expected mobile canvas height");

assert.match(src, /useDockActions\(/, "expected tools registered in the app dock");
assert.doesNotMatch(src, /<aside/, "expected no side panel eating canvas width");

assert.match(src, /\{panel \? \(/, "expected the card to render only when open");
assert.match(src, /setPanel\(null\)/, "expected cards to close");
assert.match(
  src,
  /fixed inset-x-2 bottom-\[calc\(var\(--mobile-dock-height\)/,
  "expected the card to clear the dock as a full-width sheet on phones",
);

assert.match(src, /position=\{isMobile \? "top-left"/, "expected mobile controls at top");

console.log("workbench-mobile.check.ts: ok");
