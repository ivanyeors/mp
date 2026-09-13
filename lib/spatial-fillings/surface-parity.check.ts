/**
 * Slice 06 self-check: one filling editor, three surfaces.
 *
 * The catalog went un-authored for months because the surface that could save a
 * Filling Template (Configure) gave less feedback than the surface that could
 * not (the configurator). This asserts the three surfaces cannot diverge again.
 *
 * Run: npx tsx lib/spatial-fillings/surface-parity.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/** Every surface that edits pillow Placements. Adding a fourth? Add it here. */
const EDITING_SURFACES = {
  "configurator (Staff assist mode)": {
    path: "app/[lang]/mp-config/mp-config-client.tsx",
    // The configurator mounts XrayPillow directly over its full-bleed stage; it
    // predates the frame and does not need it.
    component: "XrayPillow",
  },
  "Configure → Filling Template": {
    path: "app/[lang]/settings/inventory/configure/[card]/page.tsx",
    component: "XrayEditor",
  },
  "Result detail → assign": {
    path: "app/[lang]/settings/results/[id]/result-detail-client.tsx",
    component: "XrayEditor",
  },
} as const;

for (const [surface, { path, component }] of Object.entries(EDITING_SURFACES)) {
  const src = readFileSync(path, "utf8");
  assert.ok(src.includes(`<${component}`), `${surface} mounts the x-ray (<${component}>)`);
  assert.ok(
    !src.includes("PillowCellGrid"),
    `${surface} must not use the retired 3×3 cell grid`,
  );
}

// The grid is gone, not merely unused — an orphan file invites a fourth surface
// to pick it back up.
assert.ok(
  !existsSync("components/spatial/pillow-cell-grid.tsx"),
  "the 3×3 cell grid component is deleted",
);

// Its pure helpers survived the deletion: order detail summarises a recipe by
// cell order without mounting an editor.
const cells = readFileSync("lib/spatial-fillings/cells.ts", "utf8");
for (const helper of ["CELLS", "placementsToCells", "cellsToPlacements"]) {
  assert.ok(cells.includes(`export ${helper.startsWith("CELLS") ? "const" : "function"} ${helper}`),
    `cells.ts still exports ${helper}`);
}
const orderDetail = readFileSync("app/[lang]/settings/orders/[id]/order-detail-client.tsx", "utf8");
assert.ok(
  orderDetail.includes('from "@/lib/spatial-fillings/cells"'),
  "order detail imports CELLS from the lib, not the deleted component",
);

// Mbolster keeps its own spatial model (ADR 0008) — never the 3×3 pillow metaphor.
// Configure edits it on the configurator's capsule x-ray; Result assign keeps the list.
const BOLSTER_EDITORS: Record<string, string> = {
  "Configure → Filling Template": "<XrayBolsterEditor",
  "Result detail → assign": "BolsterCompartmentList",
};
for (const [surface, marker] of Object.entries(BOLSTER_EDITORS)) {
  const src = readFileSync(EDITING_SURFACES[surface as keyof typeof EDITING_SURFACES].path, "utf8");
  assert.ok(src.includes(marker), `${surface} edits the bolster with ${marker.replace("<", "")}`);
}

// The frame supplies the positioned, definite-height box XrayPillow needs; it
// must stay a wrapper, never a second implementation of the editing behaviour.
const frame = readFileSync("components/spatial/xray-editor.tsx", "utf8");
assert.ok(frame.includes("XrayPillow"), "the frame delegates to XrayPillow");
assert.ok(frame.includes("<XrayBolster"), "the bolster frame delegates to the configurator's XrayBolster");
assert.ok(frame.includes("aspectRatio"), "the frame gives the x-ray a definite height");
assert.ok(
  frame.includes("xrayColorVarStyle"),
  "the frame applies Product Builder colour overrides as CSS variables",
);

console.log("surface-parity.check: all assertions passed");
