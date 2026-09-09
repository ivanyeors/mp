/**
 * Spatially authored (CONTEXT.md): was this pillow recipe laid out by a person,
 * or auto-generated? Pure + browser-safe — the Configure list, the Configure
 * editor and the Result assign editor all branch on this one predicate rather
 * than each re-deriving the rule.
 *
 * The 2026-07-24 backfill materialised Placements for every legacy Filling
 * Template from flat bom_template_lines (quantities only, no spatial data) using
 * a fill-cells-in-order spread: all three `left` cells (3 x 5 = 15 pieces) before
 * it reaches `center`, and `right` never.
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

/** Sections holding at least one piece, in canonical left → center → right order. */
export function sectionsInUse(placements: readonly PillowPlacement[]): Section[] {
  const seen = new Set<Section>();
  for (const p of placements) seen.add(p.section);
  return SECTIONS.filter((s) => seen.has(s));
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
export function isSpatiallyAuthored(placements: readonly PillowPlacement[]): boolean {
  return isSpatiallyAuthoredCoverage(placements.map((p) => p.section));
}

/** Why a recipe is not Spatially authored, as a sentence for the warning. */
export function unauthoredReason(coverage: readonly string[]): string {
  const used = new Set(coverage.filter(Boolean));
  if (used.size === 0) return "No filling pieces have been placed yet.";
  if (used.size === 1) return `Every piece sits in the ${[...used][0]} section.`;
  const missing = used.has("left") ? "right" : "left";
  return `Nothing is placed in the ${missing} section, so the two sides are not balanced.`;
}

/**
 * Same predicate over the per-Section coverage the list endpoint returns, so the
 * template list does not have to fetch every placement row to render a badge.
 */
export function isSpatiallyAuthoredCoverage(coverage: readonly string[]): boolean {
  const used = new Set(coverage.filter(Boolean));
  if (used.size < 2) return false;
  // Asymmetric side support: one flank filled, the other empty. That is the
  // backfill's signature (it never reaches `right`), not a build.
  return used.has("left") === used.has("right");
}
