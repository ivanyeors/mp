/**
 * Spatially authored (CONTEXT.md): was this pillow recipe laid out by a person,
 * or auto-generated? Pure + browser-safe — the Configure list, the Configure
 * editor and the Result assign editor all branch on this one predicate rather
 * than each re-deriving the rule.
 *
 * The 2026-07-24 backfill materialised Placements for every legacy Filling
 * Template from flat bom_template_lines (quantities only, no spatial data) using
 * a fill-cells-in-order spread: all three `left` cells (3 x 5 = 15 pieces) before
 * it reaches `center`, and `right` only past 30. No template exceeds 17 pieces so
 * `right` is unreached today — a bound on the current catalog, not a property of
 * the spread (the migration's own guard permits 45).
 *
 * "Occupies more than one Section" alone is NOT enough. The two XL templates hold
 * 16 and 17 pieces, so they spill 1-2 into `center` and would pass — while being
 * exactly the same artefact, with `right` still empty. The second test is
 * symmetry: per CONTEXT.md, side-sleep support lives in left AND right, so a
 * recipe using one side but not the other has not been laid out for a pillow.
 * Together these flag all ten defaults and nag no legitimate build — left+right,
 * or all three, both pass.
 *
 * Derived on read, never stored: a column could disagree with the placements it
 * describes. Mbolster has no Section enum and is never evaluated here.
 */

import { SECTIONS, type PillowPlacement, type Section } from "./core";

/**
 * Sections holding at least one piece, in canonical left → center → right order.
 * Tolerates the nulls a left join yields for a template with no Placements, and
 * any string, since coverage arrives from the API as plain strings.
 */
export function sectionsInUse(coverage: readonly (string | null | undefined)[]): Section[] {
  const seen = new Set(coverage.filter(Boolean));
  return SECTIONS.filter((s) => seen.has(s));
}

/** Same, for a placement list. */
export function sectionsInUsePlacements(placements: readonly PillowPlacement[]): Section[] {
  return sectionsInUse(placements.map((p) => p.section));
}

/**
 * True when the recipe spans more than one Section AND treats the two sides
 * symmetrically — the operational test for Spatially authored. An empty recipe
 * is NOT authored: nothing has been placed, so nothing has been laid out.
 *
 * ponytail: deliberately not "every Section is used" — a left+right build with an
 * empty center is a real pillow, and the warning must clear the moment Staff do
 * real work.
 */
export function isSpatiallyAuthoredCoverage(
  coverage: readonly (string | null | undefined)[],
): boolean {
  const used = sectionsInUse(coverage);
  if (used.length < 2) return false;
  // Asymmetric side support: one flank filled, the other empty. That is the
  // backfill's signature (it never reaches `right`), not a build.
  return used.includes("left") === used.includes("right");
}

export function isSpatiallyAuthored(placements: readonly PillowPlacement[]): boolean {
  return isSpatiallyAuthoredCoverage(placements.map((p) => p.section));
}

/** Why a recipe is not Spatially authored, as a sentence for the warning. */
export function unauthoredReason(coverage: readonly (string | null | undefined)[]): string {
  const used = sectionsInUse(coverage);
  if (used.length === 0) return "No filling pieces have been placed yet.";
  if (used.length === 1) return `Every piece sits in the ${used[0]} section.`;
  const missing = used.includes("left") ? "right" : "left";
  return `Nothing is placed in the ${missing} section, so the two sides are not balanced.`;
}

/**
 * True only when the coverage could actually have come from the 2026-07-24
 * backfill, whose spread fills `left` first and reaches `center` only past 15
 * pieces. A recipe without `left`, or one already touching `right`, was placed by
 * hand — so the warning must not tell Staff their own work was auto-generated.
 */
export function looksLikeLegacyImport(
  coverage: readonly (string | null | undefined)[],
): boolean {
  const used = sectionsInUse(coverage);
  return used.includes("left") && !used.includes("right");
}
