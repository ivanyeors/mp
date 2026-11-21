import {
  fingerprintPlacements,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type AnyPlacement,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";

export type UnpromotedSnapshot = {
  resultId: string;
  fingerprint: string;
  scopeKey: string | null;
};

export type RankedUnpromoted = {
  fingerprint: string;
  count: number;
  representativeResultId: string;
};

export function rankUnpromoted(opts: {
  snapshots: UnpromotedSnapshot[];
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

function verify<P extends AnyPlacement>(
  placements: P[],
  fingerprint: string,
): { ok: true; placements: P[] } | { ok: false; error: string } {
  if (placements.length === 0) {
    return { ok: false, error: "Mix no longer exists on any Result" };
  }
  if (fingerprintPlacements(placements) !== fingerprint) {
    return { ok: false, error: "Mix no longer matches its fingerprint" };
  }
  return { ok: true, placements };
}

export function verifyPromotedMix(
  rows: PillowPlacementRow[],
  fingerprint: string,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  return verify(rowsToPillowPlacements(rows), fingerprint);
}

export function verifyPromotedBolsterMix(
  rows: BolsterPlacementRow[],
  fingerprint: string,
): { ok: true; placements: BolsterPlacement[] } | { ok: false; error: string } {
  return verify(rowsToBolsterPlacements(rows), fingerprint);
}
