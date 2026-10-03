/**
 * X-ray pillow UX slice 01 self-check: the dimension registry is real,
 * complete and honest — pillow geometry from the drawings, no placeholder
 * posing as a measurement, every known filling resolving without a throw,
 * and the glossary, ADR and Product Visualize column in place.
 * Run: npx tsx lib/spatial-fillings/dimensions.check.ts
 */

import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

import {
  LOFT_ALLOWANCE,
  PILLOW_DIMENSIONS,
  PILLOW_SIZES,
  PLACEHOLDER_DIMENSIONS,
  resolveDims,
} from "./dimensions";
import { SILHOUETTE_MASTER } from "./silhouette-master";

// --- Placeholders never merge as truth ---------------------------------------
assert.equal(
  PLACEHOLDER_DIMENSIONS,
  false,
  "PLACEHOLDER_DIMENSIONS is true: typed-in placeholders are posing as measurements. Replace them with Ivan's numbers (measuredOn set) or drop them so the pouch resolves as a fallback.",
);

// --- Pillow geometry from the drawings ---------------------------------------
const sections = JSON.parse(
  readFileSync(".claude/PRD-xray-pillow-ux/reference/protector-sections.json", "utf8"),
) as Record<string, { width_mm: number; section_widths_mm: [number, number, number] }>;
for (const size of PILLOW_SIZES) {
  const d = PILLOW_DIMENSIONS[size];
  const ref = sections[size];
  assert.ok(ref, `${size}: protector-sections.json has no entry`);
  assert.ok(Math.abs(d.widthMm - ref.width_mm) <= 1, `${size}: width ${d.widthMm} vs drawing ${ref.width_mm}`);
  d.sectionWidthsMm.forEach((w, i) =>
    assert.ok(Math.abs(w - ref.section_widths_mm[i]) <= 1, `${size}: section ${i} ${w} vs seam ${ref.section_widths_mm[i]}`),
  );
  assert.ok(Math.abs(d.maxLoftMm[0] - d.gusset.fullMm * (1 + LOFT_ALLOWANCE)) < 0.11, `${size}: side loft`);
  assert.ok(Math.abs(d.maxLoftMm[1] - d.gusset.backMm * (1 + LOFT_ALLOWANCE)) < 0.11, `${size}: centre loft`);
  assert.equal(d.outline.length, SILHOUETTE_MASTER.length, `${size}: outline is the scaled master`);
  assert.ok(d.outline.every((p) => p[1] <= d.lengthMm + 0.01), `${size}: a vertex lies beyond the body length (tab?)`);
}
assert.ok(SILHOUETTE_MASTER.length >= 60 && SILHOUETTE_MASTER.length <= 400, "master ring simplified to a sane vertex count");

// --- Every known filling resolves; unmeasured ones are named, not hidden ----
const seeds = ["3D (S)", "6D (S)", "6D (M)", "6D (L)", "6D (XL)", "6D (Round)", "6D+ (S)", "6D+ (L)", "6D+ (Folded)"];
const unmeasured: string[] = [];
for (const subtype of seeds) {
  const r = resolveDims({ name: "filling", subtype });
  assert.ok(r.dims.widthMm > 0 && r.dims.thicknessMm >= r.dims.minThicknessMm, `${subtype}: dims`);
  if (r.source === "fallback") unmeasured.push(`${subtype} → ${r.key}`);
}
for (const size of ["XS", "S", "M", "L"]) {
  const r = resolveDims({ name: "Cervical Neck Support", category: "accessories", size });
  assert.equal(r.kind, "neck", `neck ${size}`);
  if (r.source === "fallback") unmeasured.push(`Neck support ${size}`);
}
assert.equal(resolveDims({ name: "Latex", subtype: null }).source, "fallback", "unknown type → generic fallback");
if (unmeasured.length) {
  console.warn(`dimensions.check: ${unmeasured.length} entries still resolve as fallback (Ivan's measurements pending):\n  ${unmeasured.join("\n  ")}`);
}

// --- Products › Dimensions tab (slice 12) ------------------------------------
const page = readFileSync("app/[lang]/settings/products/products-client.tsx", "utf8");
assert.match(page, /<DimensionsSection settingsPath=\{to\} \/>/, "Products mounts the Dimensions tab");
const section = readFileSync("app/[lang]/settings/products/dimensions-section.tsx", "utf8");
assert.match(section, /Unmeasured/, "an unmeasured entry is labelled, never presented as measured");
assert.match(section, /Use default/, "Reset restores the code default");
assert.match(section, /Loft allowance/, "the allowance is editable");
assert.doesNotMatch(section, /kind:\s*"pillow"|sectionWidthsMm|scaledOutline|SILHOUETTE_MASTER/, "pillow geometry has no edit path on the page");

// --- Route: admin-gated, validated, never writes pillow geometry --------------
const route = readFileSync("app/[lang]/settings/product-builder/dimensions/route.ts", "utf8");
assert.equal(route.match(/const denied = await requireAdmin\('page-builder'\)/g)?.length, 3, "GET, POST and DELETE are admin-gated");
assert.match(route, /min_thickness_mm <= d\.thickness_mm/, "the route enforces min thickness ≤ thickness");
assert.match(route, /min_width_mm <= d\.width_mm/, "the route enforces min width ≤ width");
assert.match(route, /LOFT_ALLOWANCE_MAX_PCT/, "the allowance is capped");
assert.doesNotMatch(route, /PILLOW_DIMENSIONS|pillow_dimension|section_widths_mm|gusset_|full_mm|back_mm/, "pillow geometry has no write path");
const migration = readFileSync("supabase/migrations/20260925090000_dimension_overrides.sql", "utf8");
assert.match(migration, /min_thickness_mm <= thickness_mm/, "the database enforces min thickness ≤ thickness");
assert.match(migration, /enable row level security/, "override tables are service-role only");

// --- Glossary and ADR --------------------------------------------------------
const glossary = readFileSync("CONTEXT.md", "utf8");
for (const term of ["**Product dimensions**", "**Loft**", "**Fit status**", "**Cross-section view**", "**Nudge**", "**Natural settle**"]) {
  assert.ok(glossary.includes(`${term}`), `CONTEXT.md lacks ${term}`);
}
assert.match(glossary, /\*\*Filling visual\*\*[\s\S]{0,1200}Product dimensions/, "Filling visual amended to take its scale from the registry");
assert.ok(existsSync("docs/adr/0019-physical-fit-model.md"), "ADR 0019 exists");

console.log(`dimensions.check: ok (${PILLOW_SIZES.length} sizes, master ring ${SILHOUETTE_MASTER.length} vertices, ${unmeasured.length} fallback entries)`);
