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

// Slice 02 (ADR 0019): every pillow x-ray mount passes the Size, so the
// silhouette and the pouch footprints are the Size's, never the placeholder's,
// and the dimension overrides ride beside the colour overrides.
for (const [surface, { path }] of Object.entries(EDITING_SURFACES)) {
  const src = readFileSync(path, "utf8");
  assert.ok(/pillowSize=\{/.test(src), `${surface} passes pillowSize to the x-ray`);
  assert.ok(/dimensionOverrides=\{|itemDims=\{/.test(src), `${surface} passes the dimension overrides beside the colour overrides`);
}
const itemMaps = readFileSync("components/spatial/use-pillow-fit.ts", "utf8");
assert.ok(frame.includes("useItemMaps"), "the frame resolves item dimensions through the shared item maps hook");
assert.ok(itemMaps.includes("resolveItemDims"), "the item maps hook resolves item dimensions from the registry (+ overrides)");
assert.ok(!itemMaps.includes("xray-pillow"), "the fit hook never imports the renderer (the lazy Configure editor keeps its chunk)");
assert.ok(frame.includes("pillowSize"), "the frame passes the Size through");

// Slice 04 (ADR 0019): every editing surface computes the fit once, hands it to
// the x-ray, shows the banner for cells that cannot close, and confirms — never
// blocks — the save or hold that carries one. Same posture as Spatially authored.
for (const [surface, { path }] of Object.entries(EDITING_SURFACES)) {
  const src = readFileSync(path, "utf8");
  assert.ok(/\bfit=\{/.test(src), `${surface} hands its own fit to the x-ray`);
  assert.ok(src.includes("<FitBanner"), `${surface} shows the over-cells banner`);
  assert.ok(src.includes("confirmSaveWithOverCells("), `${surface} confirms a save/hold with an over cell`);
  assert.ok(!/confirmSaveWithOverCells\([^)]*\)\s*\)\s*throw/.test(src), `${surface} never blocks on the fit`);
}
const banner = readFileSync("components/spatial/xray-fit-banner.tsx", "utf8");
assert.ok(banner.includes("window.confirm("), "the confirm is one native confirm, not a modal flow");
assert.ok(banner.includes("overCells(fit)"), "banner and confirm read the fit's over cells — nothing recomputed");
const scope = readFileSync("components/settings/filling-template-scope.tsx", "utf8");
assert.ok(scope.includes("fitBySize"), "the Size membership chips carry a fit dot per member Size");
const configure = readFileSync(EDITING_SURFACES["Configure → Filling Template"].path, "utf8");
assert.ok(configure.includes("useFitAtSizes(placements, scopeKeys"), "the chips' dots come from the recipe judged at every member Size");

// Slice 05: the cross-section is mounted on all three surfaces, reads the same
// fit object as the x-ray, and is read-only on the shopper preview.
for (const [surface, { path }] of Object.entries(EDITING_SURFACES)) {
  const src = readFileSync(path, "utf8");
  assert.ok(src.includes("<XrayCrossSection"), `${surface} mounts the cross-section`);
  assert.ok(/cutAt=\{cut\}/.test(src), `${surface} links the x-ray's cut line to the cross-section's cut`);
  assert.ok(src.includes("useCut()"), `${surface} holds the cut in the shared hook`);
}
const configurator = readFileSync(EDITING_SURFACES["configurator (Staff assist mode)"].path, "utf8");
assert.ok(
  configurator.includes("onCutChange={staffAssist ? setCut : undefined}"),
  "the shopper preview gets the across cut read-only — no toggle, no tabs",
);
assert.ok(configurator.includes("fit={staffAssist ? assistFit : guestFit}"), "the preview's cross-section and x-ray read the same guest fit");
const crossSection = readFileSync("components/spatial/xray-cross-section.tsx", "utf8");
assert.ok(crossSection.includes("crossSectionSlabs(fit, cut)"), "the cross-section draws from the pure slab model — nothing recomputed");
assert.ok(!crossSection.includes("fitPillow("), "the cross-section never recomputes the fit");
assert.ok(!/<rect/.test(crossSection), "slabs are rounded paths, not rects");
assert.ok(crossSection.includes("<pattern"), "compressed slabs are hatched with an SVG pattern");
assert.ok(crossSection.includes("var(${visual.cssVar}, ${visual.defaultColor})"), "slabs take the pouches' family colour variables");
assert.ok(crossSection.includes("Collapsible"), "phones get the collapsed disclosure");

// Slice 09: the Mbolster speaks the same fit language on its three surfaces —
// the end-on cross-section beside the capsule (or the list), the save confirm.
const BOLSTER_SURFACES = {
  "mbolster configurator": "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "Configure → Filling Template (bolster)": EDITING_SURFACES["Configure → Filling Template"].path,
  "Result detail → assign (bolster)": EDITING_SURFACES["Result detail → assign"].path,
} as const;
for (const [surface, path] of Object.entries(BOLSTER_SURFACES)) {
  const src = readFileSync(path, "utf8");
  assert.ok(src.includes("<BolsterCrossSection"), `${surface} mounts the end-on cross-section`);
  assert.ok(src.includes("confirmSaveWithBolsterFit("), `${surface} confirms a save/hold the bolster cannot fit`);
}
const adr8 = readFileSync("docs/adr/0008-spatial-filling-placements.md", "utf8");
assert.ok(adr8.includes("Amendment") && adr8.includes("physical"), "ADR 0008 carries the physical-cap amendment");

console.log("surface-parity.check: all assertions passed");
