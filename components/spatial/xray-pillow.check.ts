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

assert.equal(Object.keys(CELL_CLIP_PATHS).length, 9, "nine cell boundary paths");
assert.equal(Object.keys(SECTION_HIT_PATHS).length, 3, "three Section regions");
// ponytail: one rounded-square pouch for every filling type until the designer
// fluid shapes land; color (family) + scale (Item size) differentiate. The
// neck support pill and the ear pad are the non-filling shapes.
assert.deepEqual(Object.keys(FILLING_SHAPE_PATHS), ["pouch", "pill", "ear"], "pouch + neck support pill + ear pad");
assert.equal(fillingVisual("Cervical Neck Support").shape, "pill");
assert.equal(fillingVisual("Ear Comfort Pad").shape, "ear");
assert.match(FILLING_SHAPE_PATHS.ear, /^M.*Z$/, "the ear pad is one closed path (its well is drawn on it)");
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

assert.equal(fillingVisual("6D+ (Folded)").shape, "pouch");
assert.equal(fillingVisual(null).cssVar, "--xray-fill-default");
assert.equal(subtypeSlug("6D+ (Folded)"), "6d-plus-folded");
assert.notEqual(fillingVisual("3D (S)").defaultColor, fillingVisual("6D (S)").defaultColor);
assert.notEqual(
  fillingVisual("6D+ (Folded)").defaultColor,
  fillingVisual("6D (S)").defaultColor,
  "6D+ matches before 6D",
);
assert.ok(stageGeometry("XS").k > stageGeometry("XL").k, "XS draws more view units per mm than XL");
assert.ok(resolveDims({ name: "filling", subtype: "6D (L)" }).dims.widthMm > 0, "every filling resolves to a footprint");

const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
assert.doesNotMatch(renderer, /<rect/, "no box crops anywhere (ADR 0009 guardrail 1)");
assert.doesNotMatch(renderer, /d="M/, "no hard-coded paths — assets only (guardrail 5)");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "silhouette clip");
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\(section\)\}\)`\}/, "nested Section clip inside silhouette (slice 11: only the Section walls are walls)");
assert.doesNotMatch(
  renderer,
  /clipPath=\{authored \? `url\(#\$\{clipId\(key\)\}\)` : undefined\}/,
  "a dived pouch is not cut to its cell: at its own length it reaches past it, pressed end to end against its neighbours (9-11-2026)",
);
assert.match(
  renderer,
  /const regions = \[SIL_REGION, SECTION_REGIONS\[dived\]\];/,
  "pouch geometry deforms to the silhouette and Section (rounded, no cut corners; free front ↔ back)",
);
assert.match(
  renderer,
  /paths\.set\(p\.key, conformPouchPath\(p, regions, shape\)\)/,
  "conform runs once per piece per geometry change, not once per render",
);
assert.match(
  renderer,
  /const authoredPaths = useMemo\(/,
  "conformed pouch outlines are memoised (pure geometry, keyed on the piece list)",
);
assert.match(renderer, /const settledPaths = useMemo\(/, "the settled outlines are memoised too (slice 11)");
assert.match(
  renderer,
  /const settledRegions = \[SIL_REGION, SECTION_REGIONS\[section\]\];/,
  "settled pieces conform against silhouette ∩ Section, not the cell polygon",
);
assert.match(renderer, /conformPouchPath\(p\.settled, settledRegions, shape\)/, "the settled rect is what conforms in the settled view");
assert.match(renderer, /d=\{settledPaths\.get\(p\.key\)!\}\s+fill="none"[\s\S]{0,240}strokeDasharray="5 4"/, "the dive ghost is a dashed stroke of the same settled path");
assert.match(renderer, /view=\{authored \? "authored" : "settled"\}/, "two views of one recipe: the dived Section is authored, the rest settled");
assert.match(renderer, /const morph = prepareMorph\(fromD, d\);/, "the settle transition goes through prepareMorph (prepared once per transition, guardrail 4)");
assert.match(renderer, /setSettleGhost\(fromD\)/, "a degenerate settle pair crossfades");
assert.match(renderer, /rect=\{labelRects\.get\(p\.key\) \?\? \(p\.section === dived \? p : p\.settled\)\}/, "labels sit on the drawn body — the conformed outline's centroid — settled outside the dive, authored inside it");
assert.match(renderer, /const d = \(p\.section === dived \? authoredPaths : settledPaths\)\.get\(p\.key\);\s*if \(!d\) continue;\s*const rect = labelRectOf\(d\);/, "the label rect comes from the same conformed path the piece is drawn with");
assert.equal((renderer.match(/settlePillow\(/g) ?? []).length, 1, "the renderer never recomputes settle — it reads the fit (moves go through the lib, slice 06)");
assert.match(renderer, /const here = alongExtent\(settlePillow\(base, fitCtx\), ref\);[\s\S]{0,600}placeAlongAt\(base, ref,/, "its one settle only plans a top-view move, written by the lib's placeAlongAt");
assert.match(renderer, /data-item-subtype/, "pieces tagged by item subtype");
assert.match(renderer, /var\(\$\{visual\.cssVar\}, \$\{visual\.defaultColor\}\)/, "colors via CSS variables");
assert.match(renderer, /layoutPlacements\(placements,/, "deterministic layout engine renders the mix");
assert.match(renderer, /layoutPlacements\(placements, \{ stage, dims: itemDims, fit \}\)/, "true-scale layout: the Size's stage and each item's registry dimensions");
assert.match(renderer, /const stage = useMemo\(\(\) => stageGeometry\(pillowSize\), \[pillowSize\]\)/, "the stage follows the pillow Size");
assert.match(renderer, /const fit = useMemo\(\s*\(\) => fitProp \?\? fitPillow\(placements, \{ size: pillowSize, dims: itemDims, loftAllowance \}\)/, "the fit is computed once per geometry change (slice 03)");
assert.match(renderer, /layoutPlacements\(placements, \{ stage, dims: itemDims, fit \}\)/, "the layout reads the fit — squeezed widths and thicknesses draw as such");
assert.doesNotMatch(renderer, /sizeScale|itemScaleMap|SIZE_SCALES/, "the relative size scale is retired");
assert.doesNotMatch(renderer, /RING_COMPRESSED|`ring-\$\{c\.section\}/, "the amber / red cell rings are gone");
assert.match(
  renderer,
  /\{\[stage\.colX\[1\], stage\.colX\[2\]\]\.map\(\(x\) => \(\s*<path[\s\S]{0,400}data-xray-divider-seam/,
  "the two divider seams are drawn at the Section columns, in the shell stroke",
);
assert.match(renderer, /strokeDasharray: status === "ok" \? undefined : "6 3"/, "a squeezed piece draws with a dashed stroke");
assert.doesNotMatch(renderer, /#ef4444|bg-red-|text-red-|RING_OVER/, "fit never turns red (Ivan, 1-11-2026): a piece in a cell that cannot close keeps the dashed outline, the gauge says it in amber");
assert.equal(
  renderer.match(/REMOVE_RED/g)?.length,
  4,
  "REMOVE_RED is defined once and drawn only by the pouch coming out (its fill and stroke) and the ghost carried off the x-ray",
);
assert.doesNotMatch(renderer, /squeezeLines|↕ \$\{|↔ \$\{/, "no ↕ / ↔ squeeze percentage beside the type label (Ivan, 1-11-2026)");
assert.match(renderer, /fitProp \?\? fitPillow\(placements, \{ size: pillowSize, dims: itemDims, loftAllowance \}\)/, "the host's fit wins; the x-ray computes its own only when none is passed");
assert.doesNotMatch(renderer, /cutAt|data-xray-cut=/, "no dashed cut line on the x-ray");
assert.match(renderer, /onDiveChange\?\.\(dived\)/, "the dive is reported so an along cut can follow it");
assert.match(renderer, /onMouseEnter=\{\(\) => setHovered\(section\)\}/, "Section hover highlight");

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
