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
assert.match(renderer, /addPiece\(placements, cell, itemId\)/, "add uses addPiece (cap + slot rules)");
assert.match(renderer, /removePiece\(placements, cell, lastSlot\)/, "remove uses removePiece (collated chip → last slot)");
assert.match(renderer, /setCellArrangement\(placements, cell, mode\)/, "arrangement toggle writes through the shared lib");
assert.match(renderer, /setPieceRow\(placements, cell, lastSlot, moveTo\)/, "per-piece mix moves rows through the lib");
assert.match(renderer, /toast\.error\(result\.error\)/, "cap/inventory errors surface on-canvas");
assert.match(renderer, /Cell full \(max 5\)/, "cap state visible on-canvas");
assert.match(renderer, /e\.key === "Escape"/, "Escape returns to full view");
assert.match(renderer, /setDived\(null\)/, "back button returns to full view");
assert.match(renderer, /getShapeMorph\(from, shape\)/, "shape swaps use prepared morphs");
assert.match(renderer, /setGhost\(from\)/, "crossfade ghost wired for degenerate pairs");
assert.doesNotMatch(renderer, /animate=\{\{ x/, "dive never pans — the x-ray overlays the shell in place");
assert.match(renderer, /setAttribute\("d"/, "morphs write path d only (no layout thrash)");
assert.doesNotMatch(renderer, /<rect/, "still no box crops (ADR 0009 guardrail 1)");

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
