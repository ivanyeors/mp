/**
 * Issue #63 (ADR 0009): sunburst sizes responsively to its container so the
 * bloom fits the narrow x-ray dive column on phones (token asserts).
 * Run: npx tsx components/ui/sunburst-responsive.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const sunburst = read("components/ui/sunburst-menu.tsx");

// Measures its container...
assert.match(sunburst, /ResizeObserver/, "must observe container size");
assert.match(sunburst, /clientWidth/, "must read container width");
// ...and clamps the diameter to it (shrink-only) rather than a fixed size.
assert.match(
  sunburst,
  /Math\.min\(\s*sizeProp\s*,\s*containerW\s*\)/,
  "effective size must clamp to the container width",
);
// Ring/hole scale with the clamp so proportions survive (ADR 0009 visuals intact).
assert.match(sunburst, /const scale = size \/ sizeProp/);
assert.match(sunburst, /ringWidthProp \* scale/);
assert.match(sunburst, /holeRadiusProp \* scale/);

// Callers still pass their fixed desktop max (unchanged).
const xray = read("components/spatial/xray-pillow.tsx");
const bolster = read("components/spatial/bolster-compartment-list.tsx");
assert.match(xray, /size=\{220\}/);
assert.match(bolster, /size=\{200\}/);

console.log("sunburst-responsive.check.ts: ok");
