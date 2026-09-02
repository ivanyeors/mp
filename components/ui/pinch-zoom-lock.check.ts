/**
 * Slice 13: site-wide pinch-zoom lock via root viewport.
 * Run: npx tsx components/ui/pinch-zoom-lock.check.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");

assert.match(layout, /maximumScale:\s*1/);
assert.match(layout, /userScalable:\s*false/);

const overflow = spawnSync(process.execPath, ["components/ui/mobile-overflow.check.ts"], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});
assert.equal(overflow.status, 0, overflow.stderr || overflow.stdout);

console.log("pinch-zoom-lock.check.ts: ok");
