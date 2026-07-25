/**
 * Issue #59: touch-visible affordances (token asserts).
 * Run: npx tsx components/ui/touch-affordance.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const upload = read("components/configurator/config-image-upload.tsx");
const dock = read("components/ui/app-dock.tsx");

// config-image-upload remove control: no longer relies SOLELY on hover-reveal.
// The remove button must carry a touch/focus reveal token.
const removeBtn = upload.slice(
  upload.indexOf('aria-label="Remove reference photo"'),
);
assert.match(
  removeBtn,
  /max-md:opacity-100/,
  "remove control must be visible on touch (max-md:opacity-100)",
);
assert.match(
  removeBtn,
  /focus-visible:opacity-100|group-focus-within:opacity-100/,
  "remove control must reveal on keyboard focus",
);
// Desktop hover-reveal preserved (must be md-scoped, not the old bare group-hover).
assert.match(removeBtn, /md:group-hover:opacity-100/);
assert.doesNotMatch(
  removeBtn,
  /(?<!md:)(?<!focus-within:)opacity-0(?!\S)[\s\S]*?(?<!md:)group-hover:opacity-100/,
  "must not rely solely on bare opacity-0 group-hover",
);

// app-dock: a touch-visible label token + ≥44px tap target on mobile.
assert.match(dock, /DockTouchLabel/, "dock needs a touch-visible label");
assert.match(dock, /md:hidden/, "touch label must be mobile-only (md:hidden)");
assert.match(
  dock,
  /max-md:min-h-11 max-md:min-w-11/,
  "dock items need a ≥44px tap target on mobile",
);

console.log("touch-affordance.check.ts: ok");
