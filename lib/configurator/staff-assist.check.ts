/**
 * Slice 04 self-check: staff assist gating + size-change rules.
 * Run: npx tsx lib/configurator/staff-assist.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addPiece,
  cellPieces,
  confirmGate,
  PILLOW_CELLS,
  recheckSelectionsForSize,
  removePiece,
  sessionTemplateId,
  type Cell,
  type SizeTier,
} from "./staff-assist";
import type { PillowPlacement } from "@/lib/spatial-fillings";

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

// --- Per-cell list editor rules: start empty, lowest free slot, max 5 ---
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
const sixth = addPiece(mix, cell, 1);
assert.ok(!sixth.ok && /Max 5/.test(sixth.error), "6th piece rejected with clear feedback");
assert.ok(addPiece(mix, { section: "left", subSection: "middle" }, 1).ok, "cap is per cell");
mix = removePiece(mix, cell, 3);
assert.equal(cellPieces(mix, cell).length, 4, "remove drops one piece");
const readd = addPiece(mix, cell, 2);
assert.ok(readd.ok, "re-add after remove fits");
const diverged = readd.placements;
assert.ok(cellPieces(diverged, cell).some((p) => p.slot === 3 && p.itemId === 2), "re-add reuses lowest free slot");

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

for (const route of [
  "app/api/mp-config/assist/route.ts",
  "app/api/mp-config/assist/context/route.ts",
]) {
  const src = readFileSync(route, "utf8");
  assert.match(src, /getAdminContext/, `${route} uses the Staff check`);
  assert.match(src, /status: 401/, `${route} denies guests with 401`);
}

console.log("staff-assist self-check ok");
