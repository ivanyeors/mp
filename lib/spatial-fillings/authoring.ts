/**
 * Spatially authored (CONTEXT.md): was this pillow recipe laid out by a person,
 * or auto-generated? Pure + browser-safe — the Configure list, the Configure
 * editor and the Result assign editor all branch on this one predicate rather
 * than each re-deriving the rule.
 *
 * The 2026-07-24 backfill materialised Placements for every legacy Filling
 * Template from flat bom_template_lines (quantities only, no spatial data) using
 * a fill-cells-in-order spread. It fills all three `left` cells — 3 x 5 = 15
 * pieces — before it reaches `center`, and no default template holds more than
 * 17 pieces. So "occupies exactly one Section" identifies an import artefact
 * with no false negatives on the current catalog.
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
 * True when the recipe spans more than one Section — the operational test for
 * Spatially authored. An empty recipe is NOT authored: nothing has been placed,
 * so there is nothing to have been laid out.
 *
 * ponytail: deliberately not "every Section is used" — a two-Section recipe can
 * be a real build, and the warning must clear the moment Staff do real work.
 */
export function isSpatiallyAuthored(placements: readonly PillowPlacement[]): boolean {
  return sectionsInUse(placements).length > 1;
}

/**
 * Same predicate over the per-Section counts the list endpoint returns, so the
 * template list does not have to fetch every placement row to render a badge.
 */
export function isSpatiallyAuthoredCoverage(coverage: readonly string[]): boolean {
  return new Set(coverage).size > 1;
}
