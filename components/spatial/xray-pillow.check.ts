/**
 * Slice 07 self-check: x-ray renderer honors ADR 0009 guardrails + wiring.
 * Run: npx tsx components/spatial/xray-pillow.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import {
  CELL_CLIP_PATHS,
  FILLING_SHAPE_PATHS,
  SECTION_HIT_PATHS,
  SILHOUETTE_INSET_TRANSFORM,
  SILHOUETTE_PATH,
} from "./xray-assets";
import { fillingVisual, sizeScale, subtypeSlug } from "@/lib/spatial-fillings/visuals";

// --- Asset pipeline contract (drop-in point for the designer SVG export) -----
assert.equal(Object.keys(CELL_CLIP_PATHS).length, 9, "nine cell boundary paths");
assert.equal(Object.keys(SECTION_HIT_PATHS).length, 3, "three Section regions");
// ponytail: one rounded-square pouch for every filling type until the designer
// fluid shapes land; color (subtype) + scale (Item size) differentiate.
assert.equal(Object.keys(FILLING_SHAPE_PATHS).length, 1, "single pouch shape");
assert.match(FILLING_SHAPE_PATHS.pouch, /^M.*Z$/, "pouch is a closed path");
assert.match(SILHOUETTE_INSET_TRANSFORM, /^translate.*scale/, "inset silhouette for shell conform");
assert.match(SILHOUETTE_PATH, /^M441\.322/, "silhouette is the shared configurator path");
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
// Item size → pouch render scale (bigger fillings draw bigger)
assert.ok(sizeScale("S") < sizeScale("M"), "S renders smaller than M");
assert.ok(sizeScale("M") < sizeScale("L"), "M renders smaller than L");
assert.equal(sizeScale(null), 1, "unknown size renders at 1");
assert.equal(sizeScale("l"), sizeScale("L"), "size lookup is case-insensitive");

// --- Renderer guardrails ------------------------------------------------------
const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
assert.doesNotMatch(renderer, /<rect/, "no box crops anywhere (ADR 0009 guardrail 1)");
assert.doesNotMatch(renderer, /d="M/, "no hard-coded paths — assets only (guardrail 5)");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "silhouette clip");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil-inner"\)\}\)`\}/, "pieces clip to the inset shell");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\(key\)\}\)`\}/, "nested cell clip inside silhouette");
assert.match(
  renderer,
  /conform=\{\[\{ d: SILHOUETTE_PATH, transform: SILHOUETTE_INSET_TRANSFORM \}\]\}/,
  "pouch borders conform to the silhouette (∂shell inside pouch stroked)",
);
assert.match(renderer, /data-item-subtype/, "pieces tagged by item subtype");
assert.match(renderer, /var\(\$\{visual\.cssVar\}, \$\{visual\.defaultColor\}\)/, "colors via CSS variables");
assert.match(renderer, /layoutPlacements\(placements,/, "deterministic layout engine renders the mix");
assert.match(renderer, /itemScaleMap\(itemSizes\)/, "Item size scales the pouch");
assert.match(renderer, /onMouseEnter=\{\(\) => setHovered\(section\)\}/, "Section hover highlight");

// --- Wiring: staff-gated mount over the silhouette ---------------------------
const client = readFileSync(join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx"), "utf8");
assert.match(client, /\{staffAssist && \(\s*<XrayPillow/, "x-ray mounts only for Staff — guests never see it");
assert.equal(client.match(/<XrayPillow/g)?.length, 1, "single x-ray mount point");
assert.match(client, /placements=\{assistPlacements\}/, "renders the assist session mix live");
assert.match(client, /staffAssist && "opacity-80 saturate-50"/, "shell desaturates in x-ray mode");
assert.match(client, /const PILLOW_PATH = SILHOUETTE_PATH/, "one silhouette source (guardrail 5)");

console.log("xray-pillow.check: all assertions passed");
