import { SECTIONS, type PillowPlacement, type Section } from "./core";

export function sectionsInUse(coverage: readonly (string | null | undefined)[]): Section[] {
  const seen = new Set(coverage.filter(Boolean));
  return SECTIONS.filter((s) => seen.has(s));
}

export function sectionsInUsePlacements(placements: readonly PillowPlacement[]): Section[] {
  return sectionsInUse(placements.map((p) => p.section));
}

// ponytail: deliberately not "every Section is used" — a left+right build with an empty center is a
// real pillow, and the warning must clear the moment Staff do real work.
export function isSpatiallyAuthoredCoverage(
  coverage: readonly (string | null | undefined)[],
): boolean {
  const used = sectionsInUse(coverage);
  if (used.length < 2) return false;
  return used.includes("left") === used.includes("right");
}

export function isSpatiallyAuthored(placements: readonly PillowPlacement[]): boolean {
  return isSpatiallyAuthoredCoverage(placements.map((p) => p.section));
}

export function unauthoredReason(coverage: readonly (string | null | undefined)[]): string {
  const used = sectionsInUse(coverage);
  if (used.length === 0) return "No filling pieces have been placed yet.";
  if (used.length === 1) return `Every piece sits in the ${used[0]} section.`;
  const missing = used.includes("left") ? "right" : "left";
  return `Nothing is placed in the ${missing} section, so the two sides are not balanced.`;
}

export function looksLikeLegacyImport(
  coverage: readonly (string | null | undefined)[],
): boolean {
  const used = sectionsInUse(coverage);
  return used.includes("left") && !used.includes("right");
}
