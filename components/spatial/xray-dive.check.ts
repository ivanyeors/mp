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
const LAYER_ICON_BUTTON = renderer.match(/const LAYER_ICON_BUTTON_CLASS =\s*\n?\s*"([^"]*)"/)?.[1] ?? "";
assert.match(renderer, /from "@\/lib\/configurator\/staff-assist"/, "edits go through the shared lib");
assert.match(renderer, /addPiece\(placements, cell, itemId, layer\)/, "add uses addPiece (layer + cap + slot rules)");
assert.match(renderer, /removePiece\(placements, cell, lastSlot\)/, "remove uses removePiece (collated chip → last slot)");
assert.match(renderer, /setCellArrangement\(placements, cell, mode\)/, "arrangement toggle writes through the shared lib");
assert.match(renderer, /moveLayer\(placements, cell, from, to\)/, "drag reorders layers through the lib");
assert.match(renderer, /removeLayer\(placements, cell, depth\)/, "layer delete goes through the lib");
assert.match(renderer, /onDragEnd=\{layerDragEnd\(cell, layers\)\}/, "layer rows are drag-sortable");
// Escape belongs to an in-flight drag (dnd-kit cancels it); ending the dive
// under one tears the sortable tree down mid-commit.
assert.match(renderer, /onDragStart=\{\(\) => \(draggingRef\.current = true\)\}/, "the drag window is tracked");
assert.match(renderer, /e\.key === "Escape" && !draggingRef\.current/, "Escape cancels the drag, not the dive");
assert.match(renderer, /window\.addEventListener\("keydown", onKey, true\)/, "the Escape guard runs before dnd-kit clears the drag flag");
// This editor's own toasts are portalled out of the root, so a click on one
// (Mirror's Undo) must not read as "outside" and end the dive.
assert.match(renderer, /closest\("\[data-sonner-toaster\]"\)/, "a click on our own toast does not end the dive");
// --- Layer drag: the three ways this reorder silently broke the panel --------
// 1. The destination is the PROJECTED index, not `operation.target`. dnd-kit
//    calls setDropTarget(source.id) for exactly the drags that moved a row, so a
//    handler reading `target` and bailing on source === target wrote nothing on
//    every real reorder — the rows had already slid, the pouches had not.
assert.match(renderer, /layerDragDestination\(layers, event\)/, "drop lands via the pure, tested adapter");
assert.doesNotMatch(renderer, /src === tgt/, "the target-is-the-destination trap is gone, not just unused");
const layerDrag = readFileSync(join(process.cwd(), "lib", "dnd", "layer-drag.ts"), "utf8");
assert.match(layerDrag, /sortableMove\(layers, event, layerSortableId\)/, "the adapter delegates to the shared sortableMove");
// 2. One provider per CELL. `source.index` is an index within the provider's
//    group, so a provider spanning front/middle/back hands sortableMove an index
//    from the wrong list — and lets a row be dragged where it cannot move.
assert.equal(renderer.match(/<DragDropProvider/g)?.length, 2, "one provider per cell (desktop panel + phone dock), never one per section");
assert.doesNotMatch(renderer, /layerKeys/, "the flat cross-cell index list is gone");
// 3. Identity ids, not positional ones: a `L{depth}` id keeps the same index
//    after the write, so dnd-kit animates every successful drop back to the slot
//    it came from. The layer's lowest slot travels with it instead.
assert.match(
  layerDrag,
  /export const layerSortableId = \(layer: readonly PillowPlacement\[\]\) => `L\$\{layer\[0\]\?\.slot \?\? 0\}`/,
  "the sortable id is the layer's identity (lowest slot), not its depth",
);
assert.match(renderer, /id=\{layerSortableId\(layer\)\}/, "rows carry the identity id");

// --- Drag affordance: last in the row, and big enough to grab ----------------
// The grip is the only control here that is dragged rather than tapped, and a
// grab that misses scrolls the page — so it sits at the row's thumb end and gets
// its own larger scale (44px on a phone) instead of the read-mostly chip sizing.
const layerRow = renderer.slice(renderer.indexOf("function LayerRow"), renderer.indexOf("export function XrayPillow"));
assert.ok(
  layerRow.indexOf("GripVertical") > layerRow.indexOf("Trash2"),
  "the grip is the LAST control in a layer row",
);
assert.match(LAYER_ICON_BUTTON, /max-md:size-11/, "phone layer buttons hit the 44px minimum target");
assert.doesNotMatch(layerRow, /CHIP_ICON_BUTTON_CLASS|CHIP_CLASS/, "layer rows use their own larger scale, not the chip one");
assert.match(layerRow, /touch-none/, "a drag on the grip must not scroll the page instead");
// The panel is an abspos box in a fixed aspect-ratio, overflow-hidden frame: a
// wrapping row grows it vertically until its top controls are clipped off the
// frame (3 layers x 2 pieces, well under every cap). Desktop truncates instead.
assert.match(layerRow, /max-md:flex-wrap/, "only the phone dock wraps a layer row");
assert.doesNotMatch(layerRow, /(?<!max-md:)flex-wrap/, "no unconditional flex-wrap on a layer row");
assert.match(renderer, /width: divedColumnWidth/, "the panel gets a definite width, not the gap to the frame edge");
assert.match(renderer, /if \(b === 0\) return \{ style: \{ \.\.\.base, top: "1%" \}/, "the front panel grows down, not off the frame");
assert.match(renderer, /bottom: "1%"/, "the back panel grows up, not off the frame");
// --- Mirror: a left ↔ right CTA, never offered on center ---------------------
// Mirroring is across the sagittal plane and `center` sits ON it, so the CTA is
// absent there rather than disabled — there is nothing staff could do to it.
assert.match(renderer, /mirrorSection\(before, section\)/, "mirror writes through the shared lib");
assert.match(renderer, /const to = mirrorTarget\(section\);\s*\n\s*if \(to === null\) return null;/, "center is offered no Mirror CTA at all");
assert.match(renderer, /`Mirror to \$\{to\}`/, "the direction is IN the label — it replaces the whole far side");
assert.match(renderer, /label: "Undo"/, "a bulk overwrite carries an Undo");
assert.match(renderer, /if \(empty\) return;/, "an empty source cannot silently clear the far side");
// `disabled` drops the button from the tab order, taking the aria-label that
// explains WHY it does nothing with it.
assert.match(renderer, /aria-disabled=\{empty\}/, "the disabled reason stays keyboard-reachable");
// The toast outlives the click, so Undo must be an inverse, not a snapshot.
assert.match(renderer, /if \(placementsRef\.current !== next\)/, "Undo no-ops once the mix changed after the mirror");
// Every cell panel is in the DIVED column, so the section bar parks elsewhere.
assert.match(renderer, /stage\.colX\[mirrorIdx\]/, "the section bar parks off the dived column, where no panel can reach it");
// Both surfaces, one builder: desktop (compact, on-canvas) + phone dock header.
assert.equal(renderer.match(/mirrorButton\(dived, (true|false)\)/g)?.length, 2, "mirror CTA mounted on desktop AND the phone dock");
assert.match(renderer, /data-xray-dive-section-bar/, "desktop gets section-level chrome for it, inside the framed box");
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

// --- Slice 04: the fit on the pillow, in the panel, in the dock, at the add ---
assert.equal(renderer.match(/<LoftGauge/g)?.length, 2, "the loft gauge is mounted once in the desktop panel and once in the phone dock");
assert.match(renderer, /<LoftGauge cell=\{cellFitOf\(subSection\)!\} size=\{pillowSize\} compact \/>/, "the desktop panel gauge is the compact one");
assert.match(renderer, /<LoftGauge cell=\{cellFitOf\(subSection\)!\} size=\{pillowSize\} compact=\{false\} \/>/, "the phone dock gauge is the readable one");
assert.match(renderer, /role="meter"/, "the gauge is a meter for assistive tech");
assert.match(renderer, /fitMessage\(cell, size\)/, "the gauge's message is the pure fitMessage — the three numbers and the Size");
assert.match(
  renderer,
  /const would = wouldFit\(placements, \{ kind: "add", cell, itemId, layer \}, \{ size: pillowSize, dims: itemDims, loftAllowance \}\);/,
  "an add is judged by wouldFit after the caps",
);
assert.match(renderer, /if \(would\.cell\?\.status === "over"\) \{\s*toast\.error\(fitMessage\(would\.cell, pillowSize\)\);\s*return;/, "over is refused with the numbers on the existing toast path; compressed goes through");
assert.doesNotMatch(renderer, /would\.cell\?\.status === "compressed"[\s\S]{0,80}return/, "compression is a working state, never a refusal");

// --- Slice 06: select a pouch, move it by key or pad, Undo -------------------
assert.match(renderer, /const \[selected, setSelected\] = useState<PieceRef \| null>\(null\)/, "selection is renderer state, a piece ref");
assert.match(renderer, /if \(selectedRef\.current\) \{\s*setSelected\(null\);\s*return;\s*\}\s*endDive\(\);/, "Escape clears the selection first; the next Escape leaves the dive");
assert.match(renderer, /setDived\(section\);\s*setOpenSub\(null\);\s*setSelected\(null\);/, "switching Sections drops the selection");
assert.match(renderer, /aria-pressed=\{on\}[\s\S]{0,1400}setSelected\(\{ section: p\.section, subSection: p\.subSection, slot: p\.slot \}\);/, "a pouch's own outline is the focusable, pressable selection target");
assert.match(renderer, /const kind = moveKeyFor\(e\);/, "keys go through the shared move map");
assert.equal(renderer.match(/onSelectPiece=\{\(slot\) => selectPiece\(/g)?.length, 2, "a layer row's label selects its piece in the panel and in the dock — the rows sit on the pouches");
assert.match(renderer, /aria-label=\{`Select \$\{label\} in \$\{cell\.section\} \$\{cell\.subSection\} — drag to move`\}/, "the centroid chip's label selects the piece under it");
assert.match(renderer, /if \(isTypingTarget\(e\.target\) \|\| draggingRef\.current\) return;/, "text controls and a drag in flight keep their keys");
assert.doesNotMatch(renderer, /MovePad|MOVE_ACTIONS/, "no move pad — the drag is the move UI (27-9-2026 review); the keys stay");
for (const fn of ["movePiece(before, ref, { cell }, fitCtx)", "reorderInLayer(before, ref, dir)", "shiftPieceLayer(before, ref, kind === \"layerUp\" ? -1 : 1, fitCtx)"]) {
  assert.ok(renderer.includes(fn), `moves go through the pure lib: ${fn}`);
}
assert.match(renderer, /toast\.error\(error\); \/\/ cap \/ fit feedback, the add's path/, "a refused move uses the add's toast path");
assert.equal(renderer.match(/label: "Undo"/g)?.length, 2, "Undo on the move toast, the Mirror pattern");
assert.match(renderer, /Undo unavailable — the mix changed after the move/, "a later edit makes the move's Undo unavailable");
assert.match(renderer, /data-xray-selected-piece/, "selection outlines the piece (the settled ghost is drawn by the dive already)");
assert.doesNotMatch(renderer, /data-xray-selected-cell/, "no dotted cell ring around the selection — the pad names the cell (26-9-2026 review)");

// --- Slice 07: drag a pouch onto a cell or a Layer -----------------------------
assert.equal(renderer.match(/<DragDropProvider/g)?.length, 2, "still one sortable provider per cell — the pouch drag is pointer events, not a nested provider");
assert.match(renderer, /onPointerDown: \(e: React\.PointerEvent<Element>\) => startDrag\(e, ref, fromPouch\),\s+onPointerMove: moveDrag,\s+onPointerUp: \(e: React\.PointerEvent<Element>\) => endDrag\(e, false, onTap\),\s+onPointerCancel: \(e: React\.PointerEvent<Element>\) => endDrag\(e, true\),/, "one set of pointer handlers makes an element a pouch's drag handle");
assert.match(renderer, /\{\.\.\.dragHandle\(ref, true, \(\) => tapPouch\(ref, inDive\)\)\}/, "the pouch's own hit path is the drag handle, in every Section");
assert.match(renderer, /\{\.\.\.dragHandle\(ref\)\}/, "the centroid chip over a pouch picks it up too");
assert.match(renderer, /\{\.\.\.pieceDragHandle\(piece\.slot\)\}/, "a layer row's label picks its pouch up too");
assert.match(renderer, /const plan = planPouchDrop\(/, "the drop resolves through the pure planner");
assert.match(renderer, /if \(plan\.kind === "chooseLayer"\)/, "a stacked cell asks which Layer; a side-by-side one does not");
assert.match(renderer, /<SunburstMenu\s+open\s+root=\{layerPickTree\}/, "the Layer picker is a sunburst at the drop point");
assert.match(renderer, /resolveLayerChoice\(choice, layerPickSizes, layerPickOwn\)/, "a picked Layer maps to movePiece's lifted-out indices");
assert.match(renderer, /touchAction: "none"/, "a finger drag on a pouch does not scroll the page");
assert.match(renderer, /svg\.addEventListener\("touchstart", onTouchStart, \{ passive: false \}\)/, "…and since touch-action does not reach SVG shapes, a non-passive touchstart on the pouches holds the page still");
assert.match(renderer, /e\.currentTarget\.setPointerCapture\(e\.pointerId\)/, "the pointer is captured for the drag");
assert.match(renderer, /Math\.hypot\(e\.clientX - d\.startX, e\.clientY - d\.startY\) < DRAG_THRESHOLD_PX/, "a press becomes a drag only past the threshold — a click still selects");
assert.match(renderer, /dropTargetFromElement\(document\.elementFromPoint\(e\.clientX, e\.clientY\)\)/, "the drop target is the tagged element under the pointer");
assert.match(renderer, /const r = movePiece\(placements, d\.source, plan\.to, reorder \? undefined : fitCtx\);/, "a drop is a movePiece — a drag can never do what a key cannot");
assert.match(renderer, /data-drop-cell=\{`\$\{section\}\/\$\{subSection\}`\}/, "the nine cell regions are drop targets while dragging (any Section)");
assert.match(renderer, /data-drop-cell=\{dropCell\}\s+data-drop-layer=\{depth\}/, "each layer row is a depth target");
assert.match(renderer, /data-drop-layer=\{layers\.length\}/, "the add-layer button is the new-Layer target");
assert.match(renderer, /fill=\{drag\.refused \? RING_OVER : "#38bdf8"\}/, "the hovered cell highlights in the selection blue (visible on the unveiled Section), red when the drop could not close");
assert.match(renderer, /data-xray-drag-ghost/, "a ghost of the outline follows the pointer");
assert.match(renderer, /if \(e\.key !== "Escape"\) return;\s*e\.stopPropagation\(\);\s*cancelDrag\(\);/, "Escape mid-drag cancels the drag and keeps the dive open");
assert.match(renderer, /draggingRef\.current = true; \/\/ Escape now cancels the drag, not the dive/, "the dive's Escape guard stands down during a pouch drag");

// --- Add target = the cell region, not a floating + button --------------------
// The old picker parked a ~28px + in each band's footer: a tiny thing to aim at,
// and the bottom one landed under the silhouette's curve. The target is now the
// cell itself, clipped to the shell so it can never sit outside the pillow.
assert.match(
  renderer,
  /d=\{stage\.cellClipPaths\[`\$\{dived\}\/\$\{subSection\}`\]\}/,
  "add hit area is the whole cell region",
);
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "hit area clipped to the silhouette");
assert.match(renderer, /<SunburstMenu\s+open\b/, "the cell opens the bloom — the menu has no trigger of its own");
assert.equal(renderer.match(/<SunburstMenu/g)?.length, 2, "one add picker at the cell you opened, one Layer picker at the drop point");
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
assert.match(renderer, /\.\.\.cellAnchor\(subSection\)\.style/, "the control panel is anchored to its own cell");
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
