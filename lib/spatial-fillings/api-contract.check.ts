/**
 * Slice 01 self-check: template API placements wiring (PUT/GET contract).
 * Run: npx tsx lib/spatial-fillings/api-contract.check.ts
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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

// --- Every pillow Placement column list must carry row_index (x-ray stack depth) ---
//
// Enumerated, not hardcoded: an earlier version of this check listed the five
// routes it knew about, which is exactly how it certified `configure/unpromoted`
// as safe while that route was SELECTing without row_index and INSERTing the rows
// back into filling_template_placements — silently flattening every stacked cell
// on Promote. So: discover every file touching a pillow placement table, and make
// omission opt-out with a written reason rather than opt-in.
const PILLOW_PLACEMENT_TABLES = ["filling_template_placements", "result_filling_placements"];

/** Files that may omit row_index, each with the reason depth cannot affect them. */
const DEPTH_IRRELEVANT: Record<string, string> = {
  "app/api/results/hold/route.ts":
    "template rows feed placementsExactMatch only; canonicalizePlacements drops row",
  "app/api/results/[id]/assign/route.ts":
    "template rows feed decideFillingAssign only; canonicalizePlacements drops row",
  "lib/results/assign-prep.ts": "selects item_id alone for derivePackList",
  "app/api/results/[id]/route.ts": "selects item_id alone for the pack list",
};

const trackedFiles = execSync(
  "git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'components/**/*.tsx'",
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

let scanned = 0;
for (const path of trackedFiles) {
  if (path.endsWith(".check.ts") || path.includes("__tests__")) continue;
  const src = readFileSync(path, "utf8");
  if (!PILLOW_PLACEMENT_TABLES.some((t) => src.includes(t))) continue;
  // Column lists live inline in .select() or hoisted into a `cols` / ROW_COLS
  // constant, so match the literal itself. Newlines allowed: a multi-line list
  // must not slip past the way it did before.
  const columnLists = src.match(/(['"`])[^'"`]*\bsub_section\b[^'"`]*\1/g) ?? [];
  if (columnLists.length === 0) continue;
  scanned += 1;
  const excuse = DEPTH_IRRELEVANT[path];
  for (const cols of columnLists) {
    // A zod shape (`sub_section: z.string()`) is a schema, not a column list.
    if (cols.includes("z.")) continue;
    if (excuse) {
      assert.ok(
        !cols.includes("row_index"),
        `${path} is on the depth-irrelevant list (${excuse}) but selects row_index — remove the exemption`,
      );
      continue;
    }
    assert.ok(
      cols.includes("row_index"),
      `${path} must select row_index: pillow Placement rows carry x-ray stack depth. ` +
        `If depth genuinely cannot affect this reader, add it to DEPTH_IRRELEVANT with a reason. (found: ${cols})`,
    );
  }
}
assert.ok(scanned >= 6, `expected to scan the known pillow placement readers, scanned ${scanned}`);

// Write paths must accept every depth the DB constraint allows. Promote and the
// hold/assign schemas are separate code from the Configure PUT and drifted apart.
for (const path of [
  "app/[lang]/settings/inventory/configure/templates/[templateId]/route.ts",
  "app/api/results/[id]/assign/route.ts",
  "app/api/results/hold/route.ts",
]) {
  const src = readFileSync(path, "utf8");
  const bounds = src.match(/row_index:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(([^)]*)\)/g) ?? [];
  assert.ok(bounds.length > 0, `${path} shape-gates row_index`);
  for (const bound of bounds) {
    assert.ok(
      bound.includes("MAX_PIECES_PER_CELL"),
      `${path} must derive its row_index bound from MAX_PIECES_PER_CELL (found: ${bound})`,
    );
  }
}

console.log("api-contract.check: all assertions passed");
