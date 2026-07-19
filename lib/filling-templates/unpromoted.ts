/**
 * Slice 09: unpromoted Filling configuration ranking + Promote verification.
 * Pure — routes feed Result snapshots and catalog-template fingerprints in,
 * and write whatever comes out. Server-only (fingerprint uses node:crypto).
 */

import {
  fingerprintPlacements,
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";

export type UnpromotedSnapshot = {
  resultId: string;
  fingerprint: string;
  /** Product-card size key of the Result (assigned size wins over suggested). */
  scopeKey: string | null;
};

export type RankedUnpromoted = {
  fingerprint: string;
  count: number;
  /** Any one Result carrying this mix — source of the placement rows. */
  representativeResultId: string;
};

/** Group in-scope snapshots by fingerprint, drop catalog-template mixes, order by count desc. */
export function rankUnpromoted(opts: {
  snapshots: UnpromotedSnapshot[];
  /** Fingerprints of ALL catalog templates in scope — inactive included, so
   * re-promoting a deactivated template's mix never dupes the catalog. */
  templateFingerprints: Iterable<string>;
  scope: { key: string };
}): RankedUnpromoted[] {
  const promoted = new Set(opts.templateFingerprints);
  const groups = new Map<string, { count: number; representativeResultId: string }>();
  for (const s of opts.snapshots) {
    if (s.scopeKey !== opts.scope.key || promoted.has(s.fingerprint)) continue;
    const g = groups.get(s.fingerprint);
    if (g) g.count += 1;
    else groups.set(s.fingerprint, { count: 1, representativeResultId: s.resultId });
  }
  return Array.from(groups.entries())
    .map(([fingerprint, g]) => ({ fingerprint, ...g }))
    .sort((a, b) => b.count - a.count || (a.fingerprint < b.fingerprint ? -1 : 1));
}

/** Re-verify a representative Result's rows still hash to the promoted fingerprint. */
export function verifyPromotedMix(
  rows: PillowPlacementRow[],
  fingerprint: string,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  if (rows.length === 0) {
    return { ok: false, error: "Mix no longer exists on any Result" };
  }
  const placements = rowsToPillowPlacements(rows);
  if (fingerprintPlacements(placements) !== fingerprint) {
    return { ok: false, error: "Mix no longer matches its fingerprint" };
  }
  return { ok: true, placements };
}
