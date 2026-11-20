import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  derivePackList,
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  pillowPlacementsToRows,
  placementsExactMatch,
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

assert.equal(
  fingerprintPlacements(rowsToPillowPlacements(payload)),
  fingerprintPlacements(rowsToPillowPlacements([...payload].reverse())),
  "fingerprint stable across payload ordering",
);

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

for (const depth of [0, MAX_LAYERS_PER_CELL - 1]) {
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
      { section: "left", sub_section: "front", slot: 1, item_id: 1, row_index: MAX_LAYERS_PER_CELL },
    ]),
    categories,
  ).ok,
  false,
  "validator still rejects a layer past the per-cell layer cap",
);

assert.ok(
  route.includes("filling_color_overrides") && route.includes("colorOverrides"),
  "template GET ships colour overrides for the x-ray CSS-variable pipeline",
);

const PILLOW_PLACEMENT_TABLES = ["filling_template_placements", "result_filling_placements"];

const DEPTH_IRRELEVANT: Record<string, string> = {
  "app/api/results/hold/route.ts":
    "template rows feed placementsExactMatch only; canonicalizePlacements drops row",
  "app/api/results/[id]/assign/route.ts":
    "template rows feed decideFillingAssign only; canonicalizePlacements drops row",
  "app/api/results/[id]/reconfigure/route.ts":
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
  const columnLists = (
    src.match(/(['"`])\s*[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*\1/g) ?? []
  ).filter((lit) => /\bsub_section\b/.test(lit));
  if (columnLists.length === 0) continue;
  scanned += 1;
  const excuse = DEPTH_IRRELEVANT[path];
  for (const cols of columnLists) {
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
    assert.ok(
      cols.includes("offset_x_mm") && cols.includes("offset_y_mm"),
      `${path} must select offset_x_mm and offset_y_mm beside row_index: a pouch's fine position ` +
        `is part of the x-ray, and Promote / hold / assign copy these rows verbatim. (found: ${cols})`,
    );
  }
}
assert.ok(scanned >= 6, `expected to scan the known pillow placement readers, scanned ${scanned}`);

for (const path of [
  "app/[lang]/settings/inventory/configure/templates/[templateId]/route.ts",
  "app/api/results/[id]/assign/route.ts",
  "app/api/results/hold/route.ts",
]) {
  const src = readFileSync(path, "utf8");
  const bounds = src.match(/row_index:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(([^)]*)\)/g) ?? [];
  assert.ok(bounds.length > 0, `${path} shape-gates row_index`);
  assert.ok(
    src.includes("MAX_LAYERS_PER_CELL"),
    `${path} must source its layer bound from MAX_LAYERS_PER_CELL — NOT from the ` +
      `per-cell piece cap, which is five layers' worth of pieces`,
  );
  for (const bound of bounds) {
    assert.ok(
      !/\.max\(\s*\d/.test(bound),
      `${path} must not hardcode its row_index bound (found: ${bound})`,
    );
  }
}

for (const path of [
  "app/[lang]/settings/inventory/configure/templates/[templateId]/route.ts",
  "app/[lang]/settings/inventory/configure/templates/[templateId]/fork/route.ts",
  "app/api/mp-config/assist/route.ts",
  "app/api/results/[id]/assign/route.ts",
  "app/api/results/[id]/reconfigure/route.ts",
  "app/api/results/hold/route.ts",
]) {
  const src = readFileSync(path, "utf8");
  for (const col of ["offset_x_mm", "offset_y_mm"]) {
    assert.match(
      src,
      new RegExp(`${col}: z\\.number\\(\\)\\.int\\(\\)\\.min\\(-MAX_OFFSET_MM\\)\\.max\\(MAX_OFFSET_MM\\)`),
      `${path} shape-gates ${col} from MAX_OFFSET_MM`,
    );
  }
}
const migration = readFileSync("supabase/migrations/20260928090000_filling_placement_offsets.sql", "utf8");
assert.equal(
  migration.match(/abs\(offset_[xy]_mm\) <= (\d+)/g)?.every((m) => m.endsWith(` ${MAX_OFFSET_MM}`)),
  true,
  "the DB offset bound is MAX_OFFSET_MM",
);

{
  const plain = rowsToPillowPlacements(payload);
  const nudged = plain.map((p, i) => (i === 0 ? { ...p, offsetXMm: -40, offsetYMm: 12 } : p));
  assert.equal(fingerprintPlacements(nudged), fingerprintPlacements(plain), "a nudge never changes the fingerprint");
  assert.equal(placementsExactMatch(nudged, plain), true, "a nudge never breaks an exact template match");
  assert.deepEqual(
    rowsToPillowPlacements(pillowPlacementsToRows(nudged)),
    nudged,
    "offsets round-trip through the row mapping",
  );
}

console.log("api-contract.check: all assertions passed");
