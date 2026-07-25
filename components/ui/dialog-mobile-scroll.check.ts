/**
 * Issue #55: Dialog scrolls internally on mobile instead of clipping (token asserts).
 * Run: npx tsx components/ui/dialog-mobile-scroll.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const dialog = read("components/ui/dialog.tsx");

// DialogContent caps height on mobile and scrolls its own overflow.
assert.match(dialog, /max-md:max-h-/);
assert.match(dialog, /overflow-y-auto/);

console.log("dialog-mobile-scroll.check.ts: ok");
