/**
 * Slice 04 self-check: staff assist gating + size-change rules.
 * Run: npx tsx lib/configurator/staff-assist.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addBolsterPiece,
  addPiece,
  cellArrangement,
  cellPieces,
  cellLayers,
  cellStack,
  confirmGate,
  PILLOW_CELLS,
  recheckSelectionsForSize,
  removeBolsterPiece,
  removePiece,
  sessionTemplateId,
  setCellArrangement,
  moveLayer,
  removeLayer,
  type Cell,
  type SizeTier,
} from "./staff-assist";
import type { BolsterPlacement, PillowPlacement } from "@/lib/spatial-fillings";

// --- Confirm-gate state machine: apply only via request → confirm ---
const m: SizeTier = { size: "M", tier: "premium" };
const l: SizeTier = { size: "L", tier: "premium" };

let gate = confirmGate({ pending: null }, { type: "request", current: m, next: m });
assert.deepEqual(gate, { state: { pending: null }, apply: null }, "unchanged size×tier → no dialog");

gate = confirmGate({ pending: null }, { type: "request", current: m, next: l });
assert.deepEqual(gate.state, { pending: l }, "changed size → pending confirm");
assert.equal(gate.apply, null, "request alone never applies");

const cancelled = confirmGate(gate.state, { type: "cancel" });
assert.deepEqual(cancelled, { state: { pending: null }, apply: null }, "cancel applies nothing (placements untouched)");

const confirmed = confirmGate(gate.state, { type: "confirm" });
assert.deepEqual(confirmed, { state: { pending: null }, apply: l }, "confirm applies the pending change");
assert.equal(
  confirmGate({ pending: null }, { type: "confirm" }).apply,
  null,
  "confirm without pending is a no-op",
);

// --- Size-change eligibility recheck ---
const recheck = recheckSelectionsForSize({
  cover: { itemId: 1, name: "Linen Cover" }, // not offered for the new size
  caseSel: { itemId: 2, name: "Cooling Case" }, // offered but stock 0
  addons: [
    { itemId: 3, name: "Travel Bag" }, // still offered
    { itemId: 4, name: "M-only Insert" }, // not offered
  ],
  offeredCovers: [{ item_id: 9, stock_available: 5 }],
  offeredCases: [{ item_id: 2, stock_available: 0 }],
  offeredAddonIds: [3],
});
assert.equal(recheck.coverId, null, "wrong-size cover auto-cleared");
assert.equal(recheck.caseId, 2, "zero-stock case KEPT (existing OOS/Pre-order signals apply)");
assert.deepEqual(recheck.addonIds, [3], "wrong-size add-on cleared, offered add-on kept");
assert.deepEqual(
  recheck.clearedNames,
  ["Linen Cover", "M-only Insert"],
  "cleared items are named for the visible note",
);
assert.deepEqual(recheck.keptOutOfStockNames, ["Cooling Case"], "kept-OOS items surfaced");
assert.deepEqual(
  recheckSelectionsForSize({
    cover: null,
    caseSel: null,
    addons: [],
    offeredCovers: [],
    offeredCases: [],
    offeredAddonIds: [],
  }),
  { coverId: null, caseId: null, addonIds: [], clearedNames: [], keptOutOfStockNames: [] },
  "empty selections stay empty with no notes",
);

// --- Per-cell list editor rules: start empty, lowest free slot, per-layer cap ---
assert.equal(PILLOW_CELLS.length, 9, "nine cells (Section × sub-section)");
const cell: Cell = { section: "left", subSection: "front" };
let mix: PillowPlacement[] = [];
for (let i = 0; i < 5; i++) {
  const r = addPiece(mix, cell, 1);
  assert.ok(r.ok, `piece ${i + 1} fits`);
  mix = r.placements;
}
assert.deepEqual(
  cellPieces(mix, cell).map((p) => p.slot),
  [1, 2, 3, 4, 5],
  "slots fill 1→5",
);
const sixth = addPiece(mix, cell, 1, 0);
assert.ok(!sixth.ok && /Max 5 pieces per layer/.test(sixth.error), "6th piece in a NAMED full layer is rejected with clear feedback");
const anywhere = addPiece(mix, cell, 1);
assert.ok(anywhere.ok, "…but an unaddressed add opens a new layer rather than dead-ending");
assert.equal(cellLayers(anywhere.placements, cell).length, 2, "the cell art's add starts layer 2 once layer 1 is full");
assert.ok(addPiece(mix, cell, 1, 1).ok, "a NEW layer takes it: the cap is per layer, not per cell");
assert.ok(addPiece(mix, { section: "left", subSection: "middle" }, 1).ok, "cells stay independent");
mix = removePiece(mix, cell, 3);
assert.equal(cellPieces(mix, cell).length, 4, "remove drops one piece");
const readd = addPiece(mix, cell, 2);
assert.ok(readd.ok, "re-add after remove fits");
const diverged = readd.placements;
assert.ok(cellPieces(diverged, cell).some((p) => p.slot === 3 && p.itemId === 2), "re-add reuses lowest free slot");

// --- Layers: side ⇄ stacked, add/remove/reorder, dense renumbering ----------
let arr: PillowPlacement[] = [];
for (let i = 0; i < 4; i++) arr = (addPiece(arr, cell, 1) as { placements: PillowPlacement[] }).placements;
assert.equal(cellArrangement(arr, cell), "side", "untouched cell is one layer, side-by-side");
assert.equal(cellLayers(arr, cell).length, 1, "…and reads as exactly one layer");
arr = setCellArrangement(arr, cell, "stacked");
assert.equal(cellArrangement(arr, cell), "stacked", "stacked once the pieces span layers");
assert.deepEqual(
  cellPieces(arr, cell).map((p) => p.row),
  [0, 1, 2, 3],
  "stacked assigns layer 0..N-1 in slot order (slot 1 = top) while they fit one each",
);
// Drag layer 0 (top) to the bottom → layers reindex from the new order.
arr = moveLayer(arr, cell, 0, 3);
assert.equal(cellPieces(arr, cell).find((p) => p.slot === 1)?.row, 3, "reorder pushes the old top to the deepest");
assert.deepEqual(cellStack(arr, cell).map((p) => p.slot), [2, 3, 4, 1], "cellStack reads top→deep after reorder");

// Several pieces share a layer: that is the whole point of layers.
let shared = (addPiece([], cell, 1) as { placements: PillowPlacement[] }).placements;
shared = (addPiece(shared, cell, 2, 1) as { placements: PillowPlacement[] }).placements;
shared = (addPiece(shared, cell, 3, 1) as { placements: PillowPlacement[] }).placements;
assert.deepEqual(cellLayers(shared, cell).map((l) => l.length), [1, 2], "layer 2 holds two pieces side by side");

// Removing a layer closes the gap; dropping to one layer drops `row` entirely.
const afterRemove = removeLayer(shared, cell, 0);
assert.equal(cellLayers(afterRemove, cell).length, 1, "deeper layers move up when one is removed");
assert.ok(
  cellPieces(afterRemove, cell).every((p) => p.row === undefined),
  "a cell back down to one layer stores no depth — the side-by-side encoding",
);
assert.equal(cellArrangement(afterRemove, cell), "side", "…so it reads side again");

// Beyond one piece per layer, "stacked" chunks evenly rather than failing.
let full: PillowPlacement[] = [];
for (let i = 0; i < 10; i++) {
  full = (addPiece(full, cell, 1, Math.floor(i / 5)) as { placements: PillowPlacement[] }).placements;
}
full = setCellArrangement(full, cell, "stacked");
assert.deepEqual(cellLayers(full, cell).map((l) => l.length), [2, 2, 2, 2, 2], "ten pieces spread evenly over five layers");
assert.ok(!addPiece(full, cell, 1, 5).ok, "a sixth layer is refused");
assert.ok(addPiece(full, cell, 1).ok, "…while the five existing layers still have room");
let packed: PillowPlacement[] = [];
for (let i = 0; i < 25; i++) packed = (addPiece(packed, cell, 1) as { placements: PillowPlacement[] }).placements;
assert.equal(cellLayers(packed, cell).length, 5, "an unaddressed add fills 5 layers of 5");
const twentySixth = addPiece(packed, cell, 1);
assert.ok(!twentySixth.ok && /Max 5 layers/.test(twentySixth.error), "a full cell refuses the 26th piece");

arr = setCellArrangement(arr, cell, "side");
assert.ok(cellPieces(arr, cell).every((p) => p.row === undefined), "side collapses back to one layer");

// --- Mbolster session mix: single compartment, no cap (ADR 0008) ------------
let bolsterMix: BolsterPlacement[] = [];
for (let i = 0; i < 7; i++) bolsterMix = addBolsterPiece(bolsterMix, 1);
assert.equal(bolsterMix.length, 7, "no piece cap on the bolster");
assert.deepEqual(bolsterMix.map((p) => p.slot), [1, 2, 3, 4, 5, 6, 7], "slots fill in order");
bolsterMix = removeBolsterPiece(bolsterMix, 3);
assert.equal(bolsterMix.length, 6, "remove drops one bolster piece");
assert.equal(addBolsterPiece(bolsterMix, 2).find((p) => p.itemId === 2)?.slot, 3, "re-add reuses lowest free slot");

// --- sessionFillingTemplateId: kept on exact match, cleared on divergence ---
const tpl = { id: 7, placements: mix };
assert.equal(sessionTemplateId(tpl, [...mix].reverse()), 7, "order-insensitive exact match keeps id");
assert.equal(sessionTemplateId(tpl, diverged), null, "diverging edit clears template id");
assert.equal(sessionTemplateId(null, mix), null, "no loaded template → null");

// --- Wiring: gating, guest-renders-nothing, staff-gated endpoints ---
const page = readFileSync("app/[lang]/mp-config/page.tsx", "utf8");
assert.match(page, /getAdminContext/, "server page resolves the Staff check");
assert.match(page, /staffAssist=\{Boolean\(staffCtx\)\}/, "page passes the gate as a boolean prop");

assert.match(
  readFileSync("app/[lang]/mp-basic/page.tsx", "utf8"),
  /export \{ default \} from "\.\.\/mp-config\/page"/,
  "/mp-basic re-exports the gated mp-config page (same chrome rules)",
);

const client = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
assert.match(client, /staffAssist = false/, "assist defaults off (guest)");
assert.match(client, /staffAssist && size && tier \? \(\s*<StaffAssistPanel/, "panel renders only for Staff");
assert.equal(client.match(/<StaffAssistPanel/g)?.length, 1, "single assist mount point");
assert.match(client, /const \[assistPlacements, setAssistPlacements\] = useState/, "mix lives in top-level client state (survives steps)");
assert.match(client, /sessionFillingTemplateId/, "template-match tracking exposed for slice 05");
assert.doesNotMatch(client, /fetch\(["'`]\/api\/mp-config\/assist/, "client makes no assist fetches itself — they live in the Staff-only panel");

const panel = readFileSync("components/configurator/staff-assist-panel.tsx", "utf8");
assert.match(panel, /\/api\/mp-config\/assist\?size=/, "panel loads templates/items from the staff-gated endpoint");
assert.doesNotMatch(panel, /save.{0,10}template|create.{0,10}template|promote/i, "no template create / save-as-template control in assist");
assert.doesNotMatch(panel, /Add filling/, "no list editor in the panel — per-piece edits live on the x-ray");
assert.doesNotMatch(
  readFileSync("components/configurator/staff-assist-bolster-panel.tsx", "utf8"),
  /Add filling|BolsterCompartmentList/,
  "bolster panel is picker-only — per-piece edits live on the x-ray",
);

for (const route of [
  "app/api/mp-config/assist/route.ts",
  "app/api/mp-config/assist/context/route.ts",
]) {
  const src = readFileSync(route, "utf8");
  assert.match(src, /getAdminContext/, `${route} uses the Staff check`);
  assert.match(src, /status: 401/, `${route} denies guests with 401`);
}

console.log("staff-assist self-check ok");
