/**
 * Slice 01 self-check: template API placements wiring (PUT/GET contract).
 * Run: npx tsx lib/spatial-fillings/api-contract.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  derivePackList,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
} from "./index";
import { fingerprintPlacements } from "./fingerprint";

const categories = new Map([
  [1, "filling"],
  [2, "filling"],
  [9, "packaging"],
]);

// --- PUT payload → mapping + validation (the exact path the route runs) ---
const payload = [
  { section: "left", sub_section: "front", slot: 1, item_id: 1 },
  { section: "left", sub_section: "front", slot: 2, item_id: 1 },
  { section: "center", sub_section: "middle", slot: 1, item_id: 2 },
];
assert.deepEqual(
  validatePillowPlacements(rowsToPillowPlacements(payload), categories),
  { ok: true },
  "valid pillow payload passes",
);
assert.equal(
  validatePillowPlacements(
    rowsToPillowPlacements([{ section: "", sub_section: "", slot: 1, item_id: 1 }]),
    categories,
  ).ok,
  false,
  "rows without a cell address (zod defaults) fail pillow validation",
);
assert.equal(
  validatePillowPlacements(rowsToPillowPlacements([{ ...payload[0], item_id: 9 }]), categories).ok,
  false,
  "non-filling item rejected on the PUT path",
);
assert.deepEqual(
  validateBolsterPlacements(rowsToBolsterPlacements([{ slot: 7, item_id: 1 }]), categories),
  { ok: true },
  "bolster payload has no slot cap",
);

// --- GET derived pack list: placements win, flat lines are the legacy fallback ---
assert.deepEqual(
  derivePackList(payload, [{ item_id: 9, quantity: 4 }]),
  [
    { item_id: 1, count: 2 },
    { item_id: 2, count: 1 },
  ],
  "packList derives from placements when present",
);
assert.deepEqual(
  derivePackList([], [{ item_id: 9, quantity: 4 }]),
  [{ item_id: 9, count: 4 }],
  "packList falls back to bom_template_lines without placements",
);

// --- Fingerprint stability on API-shaped rows ---
assert.equal(
  fingerprintPlacements(rowsToPillowPlacements(payload)),
  fingerprintPlacements(rowsToPillowPlacements([...payload].reverse())),
  "fingerprint stable across payload ordering",
);

// --- Route wiring: detail route uses the lib, both tables, and the role guard ---
const route = readFileSync(
  "app/[lang]/settings/inventory/configure/templates/[templateId]/route.ts",
  "utf8",
);
for (const needle of [
  "validatePillowPlacements",
  "validateBolsterPlacements",
  "rowsToPillowPlacements",
  "rowsToBolsterPlacements",
  "derivePackList",
  "lookupItemCategories",
  "filling_template_placements",
  "bolster_template_placements",
  "placements",
  "packList",
]) {
  assert.ok(route.includes(needle), `route wires ${needle}`);
}
assert.ok(route.includes("tpl.role !== 'filling'"), "PUT rejects placements on warehouse templates");
assert.ok(route.includes("rejectFillingLines"), "warehouse lines path (ADR 0003) untouched");

console.log("api-contract.check: all assertions passed");
