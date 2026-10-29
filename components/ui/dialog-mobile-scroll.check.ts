/**
 * Issue #55: Dialog scrolls internally on mobile instead of clipping, and is a
 * slide-up drawer below md (token asserts).
 * Run: npx tsx components/ui/dialog-mobile-scroll.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const dialog = read("components/ui/dialog.tsx");

// DialogContent caps height on mobile and scrolls its own overflow — scoped to
// max-md so desktop dialogs that manage their own inner scroll are unchanged.
assert.match(dialog, /max-md:max-h-/);
assert.match(dialog, /max-md:overflow-y-auto/);

// Below md every dialog is a bottom drawer: anchored to the bottom edge, full
// width, rounded on top, sliding up, clear of the home indicator.
for (const token of [
  "max-md:inset-x-0",
  "max-md:top-auto",
  "max-md:bottom-0",
  "max-md:translate-y-0",
  "max-md:max-w-none",
  "max-md:rounded-t-2xl",
  "max-md:pb-[calc(1rem+var(--safe-bottom))]",
  "max-md:data-[state=open]:slide-in-from-bottom",
  "max-md:data-[state=closed]:slide-out-to-bottom",
]) {
  assert.ok(dialog.includes(token), `dialog drawer: ${token}`);
}
// The handle drags the drawer down and closes past a threshold or on a flick.
assert.match(dialog, /if \(d\.dy < 96 && !flick\) return settle\(e\.currentTarget\)/);

console.log("dialog-mobile-scroll.check.ts: ok");
