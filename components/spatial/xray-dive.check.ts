/**
 * Slice 08 self-check: dive editing + prepared flubber morphs (ADR 0009).
 * Run: npx tsx components/spatial/xray-dive.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { FILLING_SHAPE_PATHS } from "./xray-assets";
import {
  getShapeMorph,
  prepareMorph,
  ringSelfIntersects,
  SHAPE_MORPHS,
} from "@/lib/spatial-fillings/morphs";

// --- Morph-pair preparation (guardrail 4: prepared at load, not ad hoc) ------
// With the single pouch shape the pair table is empty; the pipeline stays
// proven on literal paths so designer shapes drop back in without rework.
const ids = Object.keys(FILLING_SHAPE_PATHS);
assert.equal(SHAPE_MORPHS.size, ids.length * (ids.length - 1), "every ordered shape pair prepared");
for (const [key, morph] of SHAPE_MORPHS) {
  assert.equal(morph.crossfade, morph.interpolator === null, `${key}: interpolator XOR crossfade`);
  assert.equal(morph.crossfade, false, `${key}: designer shapes morph without fallback`);
  const mid = morph.interpolator!(0.5);
  assert.match(mid, /^M/, `${key}: mid-frame is a path`);
  assert.equal(mid, morph.interpolator!(0.5), `${key}: deterministic frames`);
}
assert.equal(getShapeMorph("pouch", "pouch"), null, "no-op when shape unchanged");
const literal = prepareMorph(FILLING_SHAPE_PATHS.pouch, "M20 0 L40 20 L20 40 L0 20 Z");
assert.equal(literal.crossfade, false, "pouch morphs against a designer-style path");
assert.match(literal.interpolator!(0.5), /^M/, "literal-pair mid-frame is a path");

// --- Crossfade fallback wiring on degenerate pairs ----------------------------
assert.deepEqual(
  prepareMorph("not a path", FILLING_SHAPE_PATHS.pouch),
  { interpolator: null, crossfade: true },
  "degenerate pair falls back to crossfade",
);
assert.equal(ringSelfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true, "bowtie detected");
assert.equal(ringSelfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]]), false, "square clean");

// --- Renderer wiring: dive edits reuse the session-mix functions --------------
const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
assert.match(renderer, /from "@\/lib\/configurator\/staff-assist"/, "edits go through the shared lib");
assert.match(renderer, /addPiece\(placements, cell, itemId, layer\)/, "add uses addPiece (layer + cap + slot rules)");
assert.match(renderer, /removePiece\(placements, cell, lastSlot\)/, "remove uses removePiece (collated chip → last slot)");
assert.match(renderer, /setCellArrangement\(placements, cell, mode\)/, "arrangement toggle writes through the shared lib");
assert.match(renderer, /moveLayer\(placements, cell, from, to\)/, "drag reorders layers through the lib");
assert.match(renderer, /removeLayer\(placements, cell, depth\)/, "layer delete goes through the lib");
assert.match(renderer, /<DragDropProvider onDragEnd=\{onLayerDragEnd\}>/, "layer rows are drag-sortable");
assert.doesNotMatch(renderer, /setPieceRow|ChevronUp|ChevronDown/, "chevrons gone — drag replaces the move buttons");
assert.match(renderer, /toast\.error\(result\.error\)/, "cap/inventory errors surface on-canvas");
assert.match(renderer, /Cell full \(max \$\{MAX_PIECES_PER_CELL\}\)/, "cap state visible on-canvas, sourced from the constant");
assert.match(renderer, /e\.key === "Escape"/, "Escape returns to full view");
assert.match(renderer, /setDived\(null\)/, "back button returns to full view");
assert.match(renderer, /getShapeMorph\(from, shape\)/, "shape swaps use prepared morphs");
assert.match(renderer, /setGhost\(from\)/, "crossfade ghost wired for degenerate pairs");
assert.doesNotMatch(renderer, /animate=\{\{ x/, "dive never pans — the x-ray overlays the shell in place");
assert.match(renderer, /setAttribute\("d"/, "morphs write path d only (no layout thrash)");
assert.doesNotMatch(renderer, /<rect/, "still no box crops (ADR 0009 guardrail 1)");

// --- Add target = the cell region, not a floating + button --------------------
// The old picker parked a ~28px + in each band's footer: a tiny thing to aim at,
// and the bottom one landed under the silhouette's curve. The target is now the
// cell itself, clipped to the shell so it can never sit outside the pillow.
assert.match(
  renderer,
  /d=\{CELL_CLIP_PATHS\[`\$\{dived\}\/\$\{subSection\}`\]\}/,
  "add hit area is the whole cell region",
);
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "hit area clipped to the silhouette");
assert.match(renderer, /<SunburstMenu\s+open\b/, "the cell opens the bloom — the menu has no trigger of its own");
assert.equal(renderer.match(/<SunburstMenu/g)?.length, 1, "one picker, mounted at the cell you opened");
const sunburst = readFileSync(join(process.cwd(), "components", "ui", "sunburst-menu.tsx"), "utf8");
assert.match(sunburst, /open: openProp/, "SunburstMenu accepts a controlled open for external triggers");
assert.match(sunburst, /onOpenChangeRef\.current\?\.\(next\)/, "a controlled parent still hears an internal close");

// --- Arrangement controls sit ON the cell, never in an outside gutter --------
// XrayEditor frames the pillow at the x-ray's own aspect ratio with
// overflow-hidden, so the old left/right/top gutter cluster was clipped away on
// both Admin surfaces: staff could not switch a cell to stacked at all.
const frame = readFileSync(join(process.cwd(), "components", "spatial", "xray-editor.tsx"), "utf8");
assert.match(frame, /overflow-hidden/, "the Admin frame clips to the x-ray box");
assert.doesNotMatch(renderer, /(bottom|left|right): "100%"/, "nothing positioned outside the pillow box");
assert.doesNotMatch(
  renderer,
  /externalSide|connectors|labelRefs|assignRef/,
  "gutter + leader-line + label-measurement machinery deleted, not just unused",
);
assert.match(renderer, /\.\.\.cellCenter\(subSection\)/, "the control panel is anchored to the cell centre");
// Mounted on piece count, NOT hover/focus: focusin/focusout are discrete in
// React and flush synchronously, so a focus-gated panel would unmount under the
// very Tab that reaches it and the toggle would be keyboard-unreachable.
assert.match(
  renderer,
  /if \(cellPcs\.length < 1 && !hinting\) return null;/,
  "controls mount on piece count from ONE piece up — Tab must be able to reach " +
    "the toggle, and a one-piece cell's only route to a second layer is Add layer",
);
assert.match(renderer, /role="group"/, "toggle keeps its group semantics");
assert.match(renderer, /aria-pressed=\{on\}/, "two aria-pressed buttons, not a custom widget");

// --- Layers: the picker targets a layer, and "add layer" is "add a piece" ----
// An empty layer has no Placement rows, so it cannot be stored. Making "Add
// layer" open the picker at index `layers.length` means a layer only ever exists
// once something is in it — no ghost rows, no schema for emptiness.
assert.match(renderer, /openPicker\(subSection, layers\.length\)/, "Add layer opens the picker at a new depth");
assert.match(
  renderer,
  /openPicker\(subSection, null\)/,
  "a click on the cell art asks for ANY layer with room — it must not dead-end on a full top layer",
);
assert.match(renderer, /layers\.length < MAX_LAYERS_PER_CELL/, "the Add-layer affordance respects the five-layer cap");
assert.doesNotMatch(renderer, /setDepthOrder|cellStack/, "the retired one-piece-per-depth helpers are gone, not just unused");

// --- Gating: edit affordances only behind staffAssist (guests read-only) -----
const client = readFileSync(join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx"), "utf8");
assert.match(
  client,
  /items=\{staffAssist \? assistItems : undefined\}/,
  "dive editor gated — guests never see it; the staff picker reuses the panel's inventory FillingItems",
);
assert.equal(client.match(/<XrayPillow/g)?.length, 1, "single mount point");
assert.match(
  client,
  /onPlacementsChange=\{staffAssist \? setAssistPlacements : undefined\}/,
  "staff canvas edits land in the same assistPlacements state as the list editor — guests get no write path",
);

console.log("xray-dive.check: all assertions passed");
