/**
 * Issue #63 (ADR 0009): sunburst sizes responsively to its container so the
 * bloom fits the narrow x-ray dive column on phones, and steps UP on phones
 * (thicker rings, 12px labels, 44px centre trigger) so it is thumb-sized
 * (token asserts).
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

// Phones: the centre trigger never drops below the 44px touch minimum (the hole
// is floored to fit it), labels/glyphs step up a size, and the label-hug
// geometry is told about the wider 12px glyph.
assert.match(sunburst, /const TOUCH_TARGET = 44;/, "mobile tap minimum must be 44px");
assert.match(sunburst, /const isMobile = useIsMobile\(\);/, "must read the shared mobile hook");
assert.match(
  sunburst,
  /Math\.max\(minHoleRadius, holeRadiusProp \* scale\)/,
  "hole radius must be floored for the mobile trigger",
);
// #411 (62045b88): `largeLabels` gives a large desktop bloom the phone type too; phones always get it.
assert.match(sunburst, /const bigType = isMobile \|\| largeLabels;/, "phones always get the bigger type");
assert.match(sunburst, /bigType \? "text-xs" : "text-\[10px\]"/, "wedge labels step up on phones");
assert.match(sunburst, /bigType \? "size-5" : "size-4"/, "wedge icons step up on phones");
assert.match(sunburst, /labelCharW = bigType \? MOBILE_LABEL_CHAR_W/, "hug width follows the phone font");
const layout = read("components/ui/sunburst-menu-layout.ts");
assert.match(layout, /labelCharW\?: number;/, "layout must accept the glyph width");

// Callers keep their desktop geometry and pass a larger phone preset: the
// x-ray bloom is centred on and sized to the whole stage on phones (not the
// narrow dive column), with thicker rings and a 26px hole (= 44px trigger).
const xray = read("components/spatial/xray-pillow.tsx");
const bolster = read("components/spatial/bolster-compartment-list.tsx");
// #411 (62045b88): a desktop with docked controls ("slotted") draws a larger bloom; phones are unchanged.
assert.match(xray, /size=\{isMobile \? 280 : slotted \? SLOTTED_BLOOM_PX : 220\}/);
assert.match(xray, /ringWidth=\{isMobile \? 48 : slotted \? 56 : 40\}/);
assert.match(xray, /holeRadius=\{isMobile \? 26 : slotted \? 24 : 18\}/);
assert.match(xray, /width: isMobile\s*\?\s*"100%"/, "phone bloom container must be the stage width");
assert.match(bolster, /size=\{isMobile \? 280 : 200\}/);
assert.match(bolster, /ringWidth=\{isMobile \? 48 : 40\}/);
assert.match(bolster, /holeRadius=\{isMobile \? 26 : 18\}/);

console.log("sunburst-responsive.check.ts: ok");
