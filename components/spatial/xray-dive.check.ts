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

assert.deepEqual(
  prepareMorph("not a path", FILLING_SHAPE_PATHS.pouch),
  { interpolator: null, crossfade: true },
  "degenerate pair falls back to crossfade",
);
assert.equal(ringSelfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true, "bowtie detected");
assert.equal(ringSelfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]]), false, "square clean");

const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-pillow.tsx"), "utf8");
const LAYER_ICON_BUTTON = renderer.match(/const LAYER_ICON_BUTTON_CLASS =\s*\n?\s*"([^"]*)"/)?.[1] ?? "";
assert.match(renderer, /from "@\/lib\/configurator\/staff-assist"/, "edits go through the shared lib");
assert.match(renderer, /addPiece\(placements, cell, itemId, layer\)/, "add uses addPiece (layer + cap + slot rules)");
assert.match(renderer, /removePiece\(placements, cell, lastSlot\)/, "remove uses removePiece (collated chip → last slot)");
assert.match(renderer, /setCellArrangement\(placements, cell, mode\)/, "arrangement toggle writes through the shared lib");
assert.match(renderer, /moveLayer\(placements, cell, from, to\)/, "drag reorders layers through the lib");
assert.match(renderer, /removeLayer\(placements, cell, depth\)/, "layer delete goes through the lib");
assert.match(renderer, /onDragEnd=\{layerDragEnd\(cell, layers\)\}/, "layer rows are drag-sortable");
assert.match(renderer, /onDragStart=\{\(\) => \(draggingRef\.current = true\)\}/, "the drag window is tracked");
assert.match(renderer, /e\.key === "Escape" && !draggingRef\.current/, "Escape cancels the drag, not the dive");
assert.match(renderer, /window\.addEventListener\("keydown", onKey, true\)/, "the Escape guard runs before dnd-kit clears the drag flag");
assert.match(renderer, /closest\("\[data-sonner-toaster\]"\)/, "a click on our own toast does not end the dive");
assert.match(renderer, /layerDragDestination\(layers, event\)/, "drop lands via the pure, tested adapter");
assert.doesNotMatch(renderer, /src === tgt/, "the target-is-the-destination trap is gone, not just unused");
const layerDrag = readFileSync(join(process.cwd(), "lib", "dnd", "layer-drag.ts"), "utf8");
assert.match(layerDrag, /sortableMove\(layers, event, layerSortableId\)/, "the adapter delegates to the shared sortableMove");
assert.equal(renderer.match(/<DragDropProvider/g)?.length, 2, "one provider per cell (desktop panel + phone dock), never one per section");
assert.doesNotMatch(renderer, /layerKeys/, "the flat cross-cell index list is gone");
assert.match(
  layerDrag,
  /export const layerSortableId = \(layer: readonly PillowPlacement\[\]\) => `L\$\{layer\[0\]\?\.slot \?\? 0\}`/,
  "the sortable id is the layer's identity (lowest slot), not its depth",
);
assert.match(renderer, /id=\{layerSortableId\(layer\)\}/, "rows carry the identity id");

const layerRow = renderer.slice(renderer.indexOf("function LayerRow"), renderer.indexOf("export function XrayPillow"));
assert.ok(
  layerRow.indexOf("GripVertical") > layerRow.indexOf("Trash2"),
  "the grip is the LAST control in a layer row",
);
assert.match(LAYER_ICON_BUTTON, /max-md:size-11/, "phone layer buttons hit the 44px minimum target");
assert.doesNotMatch(layerRow, /CHIP_ICON_BUTTON_CLASS|CHIP_CLASS/, "layer rows use their own larger scale, not the chip one");
assert.match(layerRow, /touch-none/, "a drag on the grip must not scroll the page instead");
assert.match(layerRow, /max-md:flex-wrap/, "only the phone dock wraps a layer row");
assert.doesNotMatch(layerRow, /(?<!max-md:)flex-wrap/, "no unconditional flex-wrap on a layer row");
assert.match(renderer, /width: divedColumnWidth/, "the panel gets a definite width, not the gap to the frame edge");
assert.match(renderer, /if \(b === 0\) return \{ style: \{ \.\.\.base, top: "1%" \}/, "the front panel grows down, not off the frame");
assert.match(renderer, /bottom: "1%"/, "the back panel grows up, not off the frame");
assert.match(renderer, /mirrorSection\(before, section\)/, "mirror writes through the shared lib");
assert.match(renderer, /const to = mirrorTarget\(section\);\s*\n\s*if \(to === null\) return null;/, "center is offered no Mirror CTA at all");
assert.match(renderer, /`Mirror to \$\{to\}`/, "the direction is IN the label — it replaces the whole far side");
assert.match(renderer, /label: "Undo"/, "a bulk overwrite carries an Undo");
assert.match(renderer, /if \(empty\) return;/, "an empty source cannot silently clear the far side");
assert.match(renderer, /aria-disabled=\{empty\}/, "the disabled reason stays keyboard-reachable");
assert.match(renderer, /if \(placementsRef\.current !== next\)/, "Undo no-ops once the mix changed after the mirror");
assert.match(renderer, /stage\.colX\[mirrorIdx\]/, "the section bar parks off the dived column, where no panel can reach it");
assert.equal(renderer.match(/mirrorButton\(dived, (true|false)\)/g)?.length, 2, "mirror CTA mounted on desktop AND the phone dock");
assert.match(renderer, /data-xray-dive-section-bar/, "desktop gets section-level chrome for it, inside the framed box");
assert.doesNotMatch(renderer, /setPieceRow|ChevronUp|ChevronDown/, "chevrons gone — drag replaces the move buttons");
assert.match(renderer, /toast\.error\(result\.error\)/, "cap/inventory errors surface on-canvas");
assert.match(renderer, /Cell full \(max \$\{MAX_PIECES_PER_CELL\}\)/, "cap state visible on-canvas, sourced from the constant");
assert.match(renderer, /e\.key === "Escape"/, "Escape returns to full view");
assert.match(renderer, /changeDive\(null\)/, "back button returns to full view");
assert.match(renderer, /getShapeMorph\(from, shape\)/, "shape swaps use prepared morphs");
assert.match(renderer, /setGhost\(from\)/, "crossfade ghost wired for degenerate pairs");
assert.doesNotMatch(renderer, /animate=\{\{ x/, "dive never pans — the x-ray overlays the shell in place");
assert.match(renderer, /setAttribute\("d"/, "morphs write path d only (no layout thrash)");
assert.doesNotMatch(renderer, /<rect/, "still no box crops (ADR 0009 guardrail 1)");

assert.doesNotMatch(renderer, /LoftGauge|role="meter"/, "no used / max mm gauge on any cell");
assert.equal(renderer.match(/<CellFitNote/g)?.length, 2, "the fit note is mounted once in the desktop panel and once in the docks");
assert.match(renderer, /export function FitNote\([\s\S]*?if \(status === "ok"\) return null;/, "a cell that fits says nothing");
assert.match(renderer, /fitMessage\(cell, size\)/, "the note's tooltip is the pure fitMessage — the three numbers and the Size");
assert.doesNotMatch(renderer, /status === "over"\) \{\s*toast\.error/, "fit never refuses an add or a move — it warns");
assert.match(renderer, /<FitNote status=\{cell\.status\} message=\{fitMessage\(cell, size\)\}/, "the cell's fit message lives in its note's warning tooltip");
assert.match(renderer, /<FitWarning status=\{status\} message=\{message\} \/>/, "the note's word comes with the warning triangle");
assert.equal(renderer.match(/warning=\{layerWarning\(subSection, depth\)\}/g)?.length, 2, "each layer row warns with its own width message, in the panel and in the dock");
assert.match(renderer, /layerFitMessage\(cell, layer\)/, "a row's tooltip is the pure per-layer message");

assert.match(renderer, /const \[selected, setSelected\] = useState<PieceRef \| null>\(null\)/, "selection is renderer state, a piece ref");
assert.match(renderer, /if \(selectedRef\.current\) \{\s*setSelected\(null\);\s*return;\s*\}\s*endDive\(\);/, "Escape clears the selection first; the next Escape leaves the dive");
assert.match(renderer, /changeDive\(section\);\s*setOpenSub\(null\);\s*setSelected\(null\);/, "switching Sections drops the selection");
assert.match(renderer, /aria-pressed=\{on\}[\s\S]{0,1400}setSelected\(\{ section: p\.section, subSection: p\.subSection, slot: p\.slot \}\);/, "a pouch's own outline is the focusable, pressable selection target");
assert.match(renderer, /const kind = moveKeyFor\(e\);/, "keys go through the shared move map");
assert.equal(renderer.match(/onSelectPiece=\{\(slot\) => selectPiece\(/g)?.length, 2, "a layer row's label selects its piece in the panel and in the dock — the rows sit on the pouches");
assert.match(renderer, /aria-label=\{`Select \$\{label\} in \$\{cell\.section\} \$\{cell\.subSection\} — drag to move`\}/, "the centroid chip's label selects the piece under it");
assert.match(renderer, /if \(isTypingTarget\(e\.target\) \|\| draggingRef\.current\) return;/, "text controls and a drag in flight keep their keys");
assert.doesNotMatch(renderer, /MovePad|MOVE_ACTIONS/, "no move pad — the drag is the move UI (27-9-2026 review); the keys stay");
for (const fn of ["movePiece(before, ref, { cell })", "reorderInLayer(before, ref, dir)", "shiftPieceLayer(before, ref, kind === \"layerUp\" ? -1 : 1)"]) {
  assert.ok(renderer.includes(fn), `moves go through the pure lib: ${fn}`);
}
assert.match(renderer, /if \(error\) \{\s*toast\.error\(error\);\s*return;\s*\}\s*if \(next === before\) return;\s*commitMove\(/, "a refused move uses the add's toast path and commits nothing");
assert.equal(renderer.match(/label: "Undo"/g)?.length, 3, "Undo on the move and remove toasts, the Mirror pattern (and on Mirror's own)");
assert.match(renderer, /const next = removePiece\(before, ref, ref\.slot\);/, "every remove on the pillow goes through removePiece, with Undo");
assert.match(renderer, /data-xray-remove-piece/, "the selected pouch carries a bin");
assert.match(renderer, /e\.key === "Delete" \|\| e\.key === "Backspace"/, "Delete takes the selected pouch out, as its bin does");
assert.match(renderer, /const removing = !underPointer && offXray\(e\.clientX, e\.clientY\);/, "off the x-ray means off every drop target too: a layer row beside or under the pillow still takes a drop");
assert.match(renderer, /closest\("\[data-xray-dive-dock\]"\)/, "a drop that misses a layer row in the dive's controls does nothing; it never removes");
assert.match(renderer, /if \(d\.removing && !canceled\) \{\s*takeOut\(d\.source\);/, "releasing a pouch carried off the x-ray takes it out; Escape still cancels");
assert.match(renderer, /Undo unavailable — the mix changed after the move/, "a later edit makes the move's Undo unavailable");
assert.match(renderer, /data-xray-selected-piece/, "selection outlines the piece (the settled ghost is drawn by the dive already)");
assert.doesNotMatch(renderer, /data-xray-selected-cell/, "no dotted cell ring around the selection — the pad names the cell (26-9-2026 review)");

assert.equal(renderer.match(/<DragDropProvider/g)?.length, 2, "still one sortable provider per cell — the pouch drag is pointer events, not a nested provider");
assert.match(renderer, /onPointerDown: \(e: React\.PointerEvent<Element>\) => startDrag\(e, ref, fromPouch\),\s+onPointerMove: moveDrag,\s+onPointerUp: \(e: React\.PointerEvent<Element>\) => endDrag\(e, false, onTap\),\s+onPointerCancel: \(e: React\.PointerEvent<Element>\) => endDrag\(e, true\),/, "one set of pointer handlers makes an element a pouch's drag handle");
assert.match(renderer, /\{\.\.\.dragHandle\(ref, true, \(\) => tapPouch\(ref, inDive\)\)\}/, "the pouch's own hit path is the drag handle, in every Section");
assert.match(renderer, /\{\.\.\.dragHandle\(ref\)\}/, "the centroid chip over a pouch picks it up too");
assert.match(renderer, /\{\.\.\.pieceDragHandle\(piece\.slot\)\}/, "a layer row's label picks its pouch up too");
assert.match(renderer, /const plan = planPouchDrop\(/, "the drop resolves through the pure planner");
assert.doesNotMatch(renderer, /chooseLayer|layerPick/, "no Layer picker between drag and drop (8-11-2026): a pouch dropped on a stacked cell joins its top Layer, shown live in both views");
assert.match(renderer, /touchAction: "none"/, "a finger drag on a pouch does not scroll the page");
assert.match(renderer, /svg\.addEventListener\("touchstart", onTouchStart, \{ passive: false \}\)/, "…and since touch-action does not reach SVG shapes, a non-passive touchstart on the pouches holds the page still");
assert.match(renderer, /e\.currentTarget\.setPointerCapture\(e\.pointerId\)/, "the pointer is captured for the drag");
assert.match(renderer, /if \(!d\.active && !pastThreshold\(\[d\.startX, d\.startY\], e\)\) return;/, "a press becomes a drag only past the threshold — a click still selects");
assert.match(renderer, /dropTargetFromElement\(document\.elementFromPoint\(e\.clientX, e\.clientY\)\)/, "the drop target is the tagged element under the pointer");
assert.match(renderer, /const moved = movePiece\(placements, d\.source, plan\.to\);/, "a drop is a movePiece — a drag can never do what a key cannot");
assert.match(renderer, /const plan = planDrop\(next, over, false\);[\s\S]*showPlan\(plan\);/, "linked views: every pointer move previews the release's own plan in both views");
assert.match(renderer, /const plan = planDrop\(d, canceled \? null : d\.over, canceled\);/, "…and the release commits that same plan");
assert.match(renderer, /stepHold\(d\.fine, \[at\.x - d\.grabX, at\.y - d\.grabY\]/, "precise by default: the held pouch keeps its grab point and a creeping hand moves it a fraction of its travel");
{
  const cutSource = readFileSync(join(process.cwd(), "components", "spatial", "xray-cross-section.tsx"), "utf8");
  for (const [name, src] of [["top view", renderer], ["side view", cutSource]] as const) {
    assert.match(src, /from "\.\/held-pouch"/, `the ${name} holds a filling with held-pouch.tsx`);
    assert.match(src, /<HeldGhost/, `the ${name} draws the shared ghost and badge`);
    assert.match(src, /= stepHold\(/, `the ${name} steps the shared fine drag`);
    assert.match(src, /pickUp\(/, `the ${name} picks up at its drawing's scale`);
    assert.doesNotMatch(src, /moveFineDrag|startFineDrag|creepGain|const SNAP_PX|const DRAG_THRESHOLD_PX/, `the ${name} keeps no hold code of its own`);
    assert.doesNotMatch(src, /pointerType === "touch" && typeof navigator|vibrate\(8\)/, `the ${name} buzzes on a snap whatever holds it`);
  }
  assert.match(renderer, /if \(d\.active && planKey === d\.planKey\) return;/, "the top view plans again only when where it would land can change, as the cut does");
}
assert.match(renderer, /document\.elementFromPoint\(centreClient\.x, centreClient\.y\)/, "what a held pouch is over is what its centre is over");
assert.match(renderer, /data-drop-cell=\{`\$\{section\}\/\$\{subSection\}`\}/, "the nine cell regions are drop targets while dragging (any Section)");
assert.match(renderer, /data-drop-cell=\{dropCell\}\s+data-drop-layer=\{depth\}/, "each layer row is a depth target");
assert.match(renderer, /data-drop-layer=\{layers\.length\}/, "the add-layer button is the new-Layer target");
assert.match(renderer, /fill=\{drag\.overfull \? AMBER : "#38bdf8"\}/, "the hovered cell highlights in the selection blue (visible on the unveiled Section), amber — never red — when the drop would leave it overfull");
assert.match(renderer, /<HeldGhost\s+handle=\{heldGhost\}\s+d=\{drag\.ghostD/, "a ghost of the outline follows the pointer (the side view's, held-pouch.tsx)");
assert.match(renderer, /if \(e\.key !== "Escape"\) return;\s*e\.stopPropagation\(\);\s*cancelDrag\(\);/, "Escape mid-drag cancels the drag and keeps the dive open");
assert.match(renderer, /if \(!d\.active\) \{\s*draggingRef\.current = true;/, "the dive's Escape guard stands down during a pouch drag: the drag raises the flag as it starts");

assert.match(
  renderer,
  /d=\{stage\.cellClipPaths\[`\$\{dived\}\/\$\{subSection\}`\]\}/,
  "add hit area is the whole cell region",
);
assert.match(renderer, /clipPath=\{`url\(#\$\{clipId\("sil"\)\}\)`\}/, "hit area clipped to the silhouette");
assert.match(renderer, /<SunburstMenu\s+open\b/, "the cell opens the bloom — the menu has no trigger of its own");
assert.equal(renderer.match(/<SunburstMenu/g)?.length, 1, "one add picker, at the cell you opened (the drop's Layer picker went 8-11-2026)");
const sunburst = readFileSync(join(process.cwd(), "components", "ui", "sunburst-menu.tsx"), "utf8");
assert.match(sunburst, /open: openProp/, "SunburstMenu accepts a controlled open for external triggers");
assert.match(sunburst, /onOpenChangeRef\.current\?\.\(next\)/, "a controlled parent still hears an internal close");

const frame = readFileSync(join(process.cwd(), "components", "spatial", "xray-editor.tsx"), "utf8");
assert.match(frame, /overflow-hidden/, "the Admin frame clips to the x-ray box");
assert.doesNotMatch(renderer, /(bottom|left|right): "100%"/, "nothing positioned outside the pillow box");
assert.doesNotMatch(
  renderer,
  /externalSide|connectors|labelRefs|assignRef/,
  "gutter + leader-line + label-measurement machinery deleted, not just unused",
);
assert.match(renderer, /\.\.\.cellAnchor\(subSection\)\.style/, "the control panel is anchored to its own cell");
assert.match(
  renderer,
  /if \(cellPcs\.length < 1 && !hinting\) return null;/,
  "controls mount on piece count from ONE piece up — Tab must be able to reach " +
    "the toggle, and a one-piece cell's only route to a second layer is Add layer",
);
assert.match(renderer, /role="group"/, "toggle keeps its group semantics");
assert.match(renderer, /aria-pressed=\{on\}/, "two aria-pressed buttons, not a custom widget");

assert.match(renderer, /openPicker\(subSection, layers\.length\)/, "Add layer opens the picker at a new depth");
assert.match(
  renderer,
  /openPicker\(subSection, null\)/,
  "a click on the cell art asks for ANY layer with room — it must not dead-end on a full top layer",
);
assert.match(renderer, /layers\.length < MAX_LAYERS_PER_CELL/, "the Add-layer affordance respects the five-layer cap");
assert.doesNotMatch(renderer, /setDepthOrder|cellStack/, "the retired one-piece-per-depth helpers are gone, not just unused");

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

assert.match(renderer, /createPortal\(<div data-xray-dive-dock[^>]*>\{diveControls\("[^"]*"\)\}<\/div>, controlsSlot!\)/, "slotted controls are the dock's own render, portalled into the host's slot");
assert.match(renderer, /controlsSlot\?\.contains\(target\)/, "a click in the slot is not 'outside' — it never ends the dive");
assert.match(renderer, /const slotted = Boolean\(controlsSlot\) && !isMobile;/, "phones keep the dock under the pillow");
