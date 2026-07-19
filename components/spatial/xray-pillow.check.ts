/**
 * Slice 07 self-check: x-ray renderer honors ADR 0009 guardrails + wiring.
 * Run: npx tsx components/spatial/xray-pillow.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { CELL_CLIP_PATHS, FILLING_SHAPE_PATHS, SECTION_HIT_PATHS, SILHOUETTE_PATH } from "./xray-assets";
import { fillingVisual, subtypeSlug } from "@/lib/spatial-fillings/visuals";

// --- Asset pipeline contract (drop-in point for the designer SVG export) -----
assert.equal(Object.keys(CELL_CLIP_PATHS).length, 9, "nine cell boundary paths");
assert.equal(Object.keys(SECTION_HIT_PATHS).length, 3, "three Section regions");
assert.equal(Object.keys(FILLING_SHAPE_PATHS).length, 3, "one fluid shape per filling family");
assert.equal(new Set(Object.values(FILLING_SHAPE_PATHS)).size, 3, "shapes are distinct");
assert.match(SILHOUETTE_PATH, /^M441\.322/, "silhouette is the shared configurator path");
for (const [key, d] of Object.entries(CELL_CLIP_PATHS)) {
  assert.match(d, /^M[\d.\- ]+(L[\d.\- ]+)+Z$/, `${key} is a closed polygon path`);
}

// --- Config map: subtype → shape + color via CSS variables --------------------
assert.equal(fillingVisual("6D+ (Folded)").shape, "pouch6dPlus", "6D+ matches before 6D");
assert.equal(fillingVisual("6D (S)").shape, "pouch6d");
assert.equal(fillingVisual("3D (S)").shape, "pouch3d");
assert.equal(fillingVisual(null).cssVar, "--xray-fill-default");
assert.equal(subtypeSlug("6D+ (Folded)"), "6d-plus-folded");
assert.notEqual(fillingVisual("3D (S)").defaultColor, fillingVisual("6D (S)").defaultColor);

// --- Renderer guardrails ------------------------------------------------------
const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
assert.doesNotMatch(renderer, /<rect/, "no box crops anywhere (ADR 0009 guardrail 1)");
assert.doesNotMatch(renderer, /d="M/, "no hard-coded paths — assets only (guardrail 5)");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "silhouette clip");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\(key\)\}\)`\}/, "nested cell clip inside silhouette");
assert.match(renderer, /data-item-subtype/, "pieces tagged by item subtype");
assert.match(renderer, /var\(\$\{visual\.cssVar\}, \$\{visual\.defaultColor\}\)/, "colors via CSS variables");
assert.match(renderer, /layoutPlacements\(placements\)/, "deterministic layout engine renders the mix");
assert.match(renderer, /onMouseEnter=\{\(\) => setHovered\(section\)\}/, "Section hover highlight");

// --- Wiring: staff-gated mount over the silhouette ---------------------------
const client = readFileSync(join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx"), "utf8");
assert.match(client, /\{staffAssist && \(\s*<XrayPillow/, "x-ray mounts only for Staff — guests never see it");
assert.equal(client.match(/<XrayPillow/g)?.length, 1, "single x-ray mount point");
assert.match(client, /placements=\{assistPlacements\}/, "renders the assist session mix live");
assert.match(client, /staffAssist && "opacity-80 saturate-50"/, "shell desaturates in x-ray mode");
assert.match(client, /const PILLOW_PATH = SILHOUETTE_PATH/, "one silhouette source (guardrail 5)");

console.log("xray-pillow.check: all assertions passed");
