/**
 * Issue #54: Button/Input touch baseline ≥44px on mobile (token asserts).
 * Run: npx tsx components/ui/touch-target-baseline.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const button = read("components/ui/button.tsx");
const input = read("components/ui/input.tsx");

// Button default/sm/lg/icon size tokens reach ≥44px on mobile; icon also gets min-w.
assert.match(button, /default:\s*"h-9 max-md:min-h-11/);
assert.match(button, /sm:\s*"h-8 max-md:min-h-11/);
assert.match(button, /lg:\s*"h-10 max-md:min-h-11/);
assert.match(button, /icon:\s*"size-9 max-md:min-h-11 max-md:min-w-11/);

// Input base ≥44px on mobile.
assert.match(input, /max-md:min-h-11/);

// Font must stay zoom-safe (text-base on mobile, md:text-sm on desktop).
assert.match(input, /text-base[\s\S]*?md:text-sm/);

console.log("touch-target-baseline.check.ts: ok");
