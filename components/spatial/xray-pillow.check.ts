/**
 * Slice 07 self-check: x-ray renderer honors ADR 0009 guardrails + wiring.
 * Run: npx tsx components/spatial/xray-pillow.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import {
  CELL_CLIP_PATHS,
  CELL_POLYGONS,
  FILLING_SHAPE_PATHS,
  SECTION_HIT_PATHS,
  SILHOUETTE_PATH,
  SILHOUETTE_POLYGON,
} from "./xray-assets";
import { fillingVisual, subtypeSlug } from "@/lib/spatial-fillings/visuals";
import { PILLOW_SIZES, resolveDims } from "@/lib/spatial-fillings/dimensions";
import { stageGeometry } from "@/lib/spatial-fillings/xray-stage";

// --- Asset pipeline contract (drop-in point for the designer SVG export) -----
assert.equal(Object.keys(CELL_CLIP_PATHS).length, 9, "nine cell boundary paths");
assert.equal(Object.keys(SECTION_HIT_PATHS).length, 3, "three Section regions");
// ponytail: one rounded-square pouch for every filling type until the designer
// fluid shapes land; color (family) + scale (Item size) differentiate. The
// neck support pill is the one non-filling shape.
assert.deepEqual(Object.keys(FILLING_SHAPE_PATHS), ["pouch", "pill"], "pouch + neck support pill");
assert.equal(fillingVisual("Cervical Neck Support").shape, "pill");
assert.match(FILLING_SHAPE_PATHS.pouch, /^M.*Z$/, "pouch is a closed path");
assert.ok(SILHOUETTE_POLYGON.length > 50, "silhouette sampled densely for conform geometry");
assert.equal(Object.keys(CELL_POLYGONS).length, 9, "cell polygons mirror the clip paths");
assert.equal(SILHOUETTE_PATH, stageGeometry("M").silhouettePath, "the M silhouette is the registry outline (slice 02)");
for (const size of PILLOW_SIZES) {
  const stage = stageGeometry(size);
  assert.match(stage.silhouettePath, /^M[\d.\- ]+( L[\d.\- ]+)+ Z$/, `${size}: silhouette is a closed polygon path`);
  assert.equal(Object.keys(stage.cellClipPaths).length, 9, `${size}: nine cell regions`);
}
for (const [key, d] of Object.entries(CELL_CLIP_PATHS)) {
  assert.match(d, /^M[\d.\- ]+(L[\d.\- ]+)+Z$/, `${key} is a closed polygon path`);
}

// --- Config map: subtype → shape + color via CSS variables --------------------
assert.equal(fillingVisual("6D+ (Folded)").shape, "pouch");
assert.equal(fillingVisual(null).cssVar, "--xray-fill-default");
assert.equal(subtypeSlug("6D+ (Folded)"), "6d-plus-folded");
assert.notEqual(fillingVisual("3D (S)").defaultColor, fillingVisual("6D (S)").defaultColor);
assert.notEqual(
  fillingVisual("6D+ (Folded)").defaultColor,
  fillingVisual("6D (S)").defaultColor,
  "6D+ matches before 6D",
);
// Registry footprint → pouch size (slice 02, ADR 0019): the Size sets the scale,
// the registry the millimetres; the relative SIZE_SCALES are gone.
assert.ok(stageGeometry("XS").k > stageGeometry("XL").k, "XS draws more view units per mm than XL");
assert.ok(resolveDims({ name: "filling", subtype: "6D (L)" }).dims.widthMm > 0, "every filling resolves to a footprint");

// --- Renderer guardrails ------------------------------------------------------
const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
assert.doesNotMatch(renderer, /<rect/, "no box crops anywhere (ADR 0009 guardrail 1)");
assert.doesNotMatch(renderer, /d="M/, "no hard-coded paths — assets only (guardrail 5)");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "silhouette clip");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\(key\)\}\)`\}/, "nested cell clip inside silhouette");
assert.match(
  renderer,
  /const regions = \[SIL_REGION, CELL_REGIONS\[key\]\];/,
  "pouch geometry deforms to the silhouette and cell (rounded, no cut corners)",
);
assert.match(
  renderer,
  /paths\.set\(p\.key, conformPouchPath\(p, regions, 2, shape\)\)/,
  "conform runs once per piece per geometry change, not once per render",
);
assert.match(
  renderer,
  /const conformedPaths = useMemo\(/,
  "conformed pouch outlines are memoised (pure geometry, keyed on the piece list)",
);
assert.match(renderer, /data-item-subtype/, "pieces tagged by item subtype");
assert.match(renderer, /var\(\$\{visual\.cssVar\}, \$\{visual\.defaultColor\}\)/, "colors via CSS variables");
assert.match(renderer, /layoutPlacements\(placements,/, "deterministic layout engine renders the mix");
assert.match(renderer, /layoutPlacements\(placements, \{ stage, dims: itemDims, fit \}\)/, "true-scale layout: the Size's stage and each item's registry dimensions");
assert.match(renderer, /const stage = useMemo\(\(\) => stageGeometry\(pillowSize\), \[pillowSize\]\)/, "the stage follows the pillow Size");
assert.match(renderer, /const fit = useMemo\(\s*\(\) => fitPillow\(placements, \{ size: pillowSize, dims: itemDims, loftAllowance \}\)/, "the fit is computed once per geometry change (slice 03)");
assert.match(renderer, /layoutPlacements\(placements, \{ stage, dims: itemDims, fit \}\)/, "the layout reads the fit — squeezed widths and thicknesses draw as such");
assert.doesNotMatch(renderer, /sizeScale|itemScaleMap|SIZE_SCALES/, "the relative size scale is retired");
assert.match(renderer, /onMouseEnter=\{\(\) => setHovered\(section\)\}/, "Section hover highlight");

// --- Wiring: one gated mount over the silhouette (RE slice 07: guests read-only) ---
const client = readFileSync(join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx"), "utf8");
assert.match(client, /\{xrayVisible && \(\s*<XrayPillow/, "x-ray mounts behind one visibility gate");
assert.match(
  client,
  /const xrayVisible = staffAssist \|\| guestXray/,
  "gate = staff assist OR revealed spatial template — nothing else",
);
assert.match(
  client,
  /previewMixMode\(guestPlacements\) === "xray"/,
  "guest fallback selection goes through previewMixMode (legacy-flat keeps text)",
);
assert.equal(client.match(/<XrayPillow/g)?.length, 1, "single x-ray mount point");
assert.match(
  client,
  /placements=\{staffAssist \? assistPlacements : guestPlacements\}/,
  "staff renders the assist session mix live; guests the recommended template",
);
assert.match(client, /xrayVisible && "opacity-80 saturate-50"/, "shell desaturates in x-ray mode");
assert.match(client, /stageGeometry\(/, "one silhouette source: the shell and the x-ray share the Size's stage (guardrail 5)");
assert.doesNotMatch(client, /SILHOUETTE_PATH/, "no fixed placeholder silhouette left in the configurator");
assert.match(client, /pillowSize=\{/, "the configurator passes the Size to the x-ray");

console.log("xray-pillow.check: all assertions passed");
