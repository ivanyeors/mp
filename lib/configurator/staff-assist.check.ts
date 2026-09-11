/**
 * Slice 04 self-check: staff assist gating + size-change rules.
 * Run: npx tsx lib/configurator/staff-assist.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ADMIN_ROLES, roleHasPermission } from "../auth/permissions";

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
  saveAffordance,
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

// --- saveAffordance ---------------------------------------------------------
// An untouched mix has nothing to save: saving it new would duplicate the very
// template it matches.
assert.deepEqual(
  saveAffordance({ placements: mix, loaded: tpl }),
  { dirty: false, canOverwrite: false, canSaveNew: false },
  "mix matching its template offers no save",
);

// Edited from a template → both paths open.
assert.deepEqual(
  saveAffordance({ placements: diverged, loaded: tpl }),
  { dirty: true, canOverwrite: true, canSaveNew: true },
  "edited mix can overwrite its template or fork a new one",
);

// Built from scratch → nothing to overwrite, only a new template to create.
assert.deepEqual(
  saveAffordance({ placements: diverged, loaded: null }),
  { dirty: true, canOverwrite: false, canSaveNew: true },
  "scratch-built mix can only be saved as new",
);

// Empty stage is not a saveable mix — it would publish an empty template.
assert.deepEqual(
  saveAffordance({ placements: [], loaded: null }),
  { dirty: false, canOverwrite: false, canSaveNew: false },
  "empty mix offers no save",
);
assert.deepEqual(
  saveAffordance({ placements: [], loaded: tpl }),
  { dirty: false, canOverwrite: false, canSaveNew: false },
  "clearing the stage does not offer to blank the catalog template",
);

// --- Wiring: gating, guest-renders-nothing, staff-gated endpoints ---
const page = readFileSync("app/[lang]/mp-config/page.tsx", "utf8");
assert.match(page, /getAdminContext/, "server page resolves the Staff check");
assert.match(
  page,
  /roleHasPermission\(staffCtx\.role, "results"\)/,
  "assist mode needs the results permission, not mere back-office membership",
);
assert.match(
  page,
  /staffAssist=\{Boolean\(staffCtx && roleHasPermission\(staffCtx\.role, "results"\)\)\}/,
  "page passes the gate as a boolean prop",
);
assert.match(
  readFileSync("app/[lang]/mbolster-config/page.tsx", "utf8"),
  /staffAssist=\{Boolean\(staffCtx && roleHasPermission\(staffCtx\.role, "results"\)\)\}/,
  "bolster surface gates assist the same way",
);

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
// Staff may now publish an edited mix back to the catalog (override or save
// new). The rails that decision rests on, asserted here so they cannot quietly
// regress into "any staff member can rewrite any template from a session":
assert.match(panel, /SaveFillingTemplate/, "assist offers the save control");
assert.match(
  panel,
  /affordance\.dirty \? \(\s*<SaveFillingTemplate/,
  "save appears only for a mix that actually diverges (saveAffordance)",
);
assert.match(
  panel,
  /overwrite=\{\s*affordance\.canOverwrite/,
  "overwrite is offered only when a template is loaded to replace",
);

const saveUi = readFileSync("components/configurator/save-filling-template.tsx", "utf8");
assert.match(saveUi, /mode: "overwrite"/, "save supports replacing the loaded template");
assert.match(saveUi, /mode: "new"/, "save supports forking a new catalog template");
assert.match(
  saveUi,
  /setConfirming\(true\)/,
  "overwriting a curated template goes through a confirm gate",
);
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
  // requireAdmin refuses guests with 401 and under-permissioned staff with 403,
  // so the endpoint can never be reached by a role the page gate excludes.
  assert.match(src, /requireAdmin\("results"\)/, `${route} gates on the assist permission`);
}

// Writing the catalog is a stronger act than reading it into one session: the
// GET stays open to any Staff, the save requires the inventory permission.
const assistRoute = readFileSync("app/api/mp-config/assist/route.ts", "utf8");
assert.match(
  assistRoute,
  /export async function POST[\s\S]*?requireAdmin\("inventory"\)/,
  "POST /assist requires the inventory permission, not just Staff",
);
assert.match(
  assistRoute,
  /placements: z\.array\(PlacementRowSchema\)\.min\(1\)/,
  "an empty mix can never be saved — it would publish or blank an empty template",
);
assert.match(
  assistRoute,
  /tpl\.kind !== scope\.kind \|\| tpl\.key !== scope\.key/,
  "overwrite refuses a template scoped to another size/length",
);

// The Save control renders on "mix is dirty" alone — the panel does not know the
// viewer's role. That is only safe while every role that can ENTER assist mode
// can also SAVE; otherwise the button renders straight into a 403. Adding a role
// with `results` but not `inventory` must fail here, not in front of staff.
for (const role of ADMIN_ROLES) {
  if (!roleHasPermission(role, "results")) continue;
  assert.ok(
    roleHasPermission(role, "inventory"),
    `role "${role}" can enter assist mode but cannot save a template — either grant it inventory, or hide the Save control behind the permission`,
  );
}

console.log("staff-assist self-check ok");
