/**
 * Slice 01 self-check: template API placements wiring (PUT/GET contract).
 * Run: npx tsx lib/spatial-fillings/api-contract.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  derivePackList,
  MAX_PIECES_PER_CELL,
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

// --- Depth bound: request schema must not be tighter than the validator ---
// The route's zod bound sat at the retired two-value top/bottom lane while the DB
// constraint and validatePillowPlacements both moved to the full 0..4 depth range,
// so the API silently refused any stack deeper than layer 1.
assert.ok(
  route.includes("MAX_PIECES_PER_CELL - 1"),
  "route derives its row_index bound from MAX_PIECES_PER_CELL, not a restated literal",
);
assert.ok(
  !/row_index:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(\d/.test(route),
  "route's row_index bound is not a hardcoded number",
);
for (const depth of [0, MAX_PIECES_PER_CELL - 1]) {
  assert.deepEqual(
    validatePillowPlacements(
      rowsToPillowPlacements([
        { section: "left", sub_section: "front", slot: 1, item_id: 1, row_index: depth },
      ]),
      categories,
    ),
    { ok: true },
    `validator accepts stack depth ${depth}, so the route schema must too`,
  );
}
assert.equal(
  validatePillowPlacements(
    rowsToPillowPlacements([
      { section: "left", sub_section: "front", slot: 1, item_id: 1, row_index: MAX_PIECES_PER_CELL },
    ]),
    categories,
  ).ok,
  false,
  "validator still rejects a stack depth past the cell cap",
);

// --- Colour overrides reach the Admin Panel from the server ---
// filling_color_overrides is service-role-only under RLS; a browser query returns
// nothing and the x-ray silently falls back to code defaults, so the Admin Panel
// would colour pouches differently from the configurator.
assert.ok(
  route.includes("filling_color_overrides") && route.includes("colorOverrides"),
  "template GET ships colour overrides for the x-ray CSS-variable pipeline",
);

// --- Render-path reads must carry row_index (x-ray stack depth) ---
// Depth is visual-only and deliberately OUT of the fingerprint (core.ts), so this
// is scoped to routes whose placements get rendered. Readers deliberately excluded,
// because depth cannot affect their answer:
//   results/hold + results/[id]/assign — load template rows only to compare against
//     the session mix via canonicalizePlacements, which drops slot and never reads row.
//   results/assign-prep — selects item_id alone for the derived pack list.
//   configure/unpromoted — fingerprints mixes; row_index is excluded from the
//     fingerprint by design, so selecting it here would signal the opposite.
// Adding a render surface? Add its route here.
const RENDER_PATH_PLACEMENT_READERS = [
  "app/api/mp-config/assist/route.ts",
  "app/api/mp-config/assist/context/route.ts",
  "app/api/shop/customize/route.ts",
  "app/api/mp-basic/recommend/route.ts",
  "app/[lang]/settings/inventory/configure/templates/[templateId]/route.ts",
];
for (const path of RENDER_PATH_PLACEMENT_READERS) {
  const src = readFileSync(path, "utf8");
  // Column lists are sometimes inlined in .select() and sometimes hoisted into a
  // `cols` variable, so match the literal itself rather than the call site.
  const columnLists = src.match(/(['"`])[^'"`\n]*\bsub_section\b[^'"`\n]*\1/g) ?? [];
  assert.ok(columnLists.length > 0, `${path} reads pillow placement rows`);
  for (const cols of columnLists) {
    assert.ok(
      cols.includes("row_index"),
      `${path} must select row_index on the render path (found: ${cols})`,
    );
  }
}

console.log("api-contract.check: all assertions passed");
