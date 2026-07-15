import { DROP_OFF_NODE } from "./drop-off-sink";
import { median } from "./chrome";
import type { JourneyEdge } from "./transitions";

export type VisitMeta = {
  id: string;
  visitorId: string;
  startedAt: string;
  endedAt: string | null;
  dropOffPath: string | null;
};

export type VisitorCohort = "new" | "returning";

export type ReturnHit = {
  visitId: string;
  visitorId: string;
  landingPath: string;
  priorVisitId: string;
  priorDropOffPath: string | null;
  priorEndedAt: string;
  returnedAt: string;
  gapMs: number;
};

/** Immediately prior Visit for the same Visitor that already ended. */
export function priorEndedVisit(
  visit: VisitMeta,
  visitorVisits: VisitMeta[],
): VisitMeta | null {
  let best: VisitMeta | null = null;
  for (const v of visitorVisits) {
    if (v.id === visit.id) continue;
    if (!v.endedAt) continue;
    if (v.startedAt >= visit.startedAt) continue;
    if (v.endedAt > visit.startedAt) continue; // still open when this one started
    if (!best || v.startedAt > best.startedAt) best = v;
  }
  return best;
}

export function classifyVisitCohort(
  visit: VisitMeta,
  visitorVisits: VisitMeta[],
): VisitorCohort {
  return priorEndedVisit(visit, visitorVisits) ? "returning" : "new";
}

/**
 * Returns into Visits in `focusVisitIds`: landing page + gap from prior Drop-off.
 * Same-session backtracks are not returns (those stay solid page→page edges).
 */
export function collectReturns(
  visits: VisitMeta[],
  landingByVisitId: Map<string, string>,
  focusVisitIds: Set<string>,
): ReturnHit[] {
  const byVisitor = new Map<string, VisitMeta[]>();
  for (const v of visits) {
    const list = byVisitor.get(v.visitorId) ?? [];
    list.push(v);
    byVisitor.set(v.visitorId, list);
  }

  const hits: ReturnHit[] = [];
  for (const visit of visits) {
    if (!focusVisitIds.has(visit.id)) continue;
    const landing = landingByVisitId.get(visit.id);
    if (!landing || landing === DROP_OFF_NODE) continue;
    const prior = priorEndedVisit(visit, byVisitor.get(visit.visitorId) ?? []);
    if (!prior?.endedAt) continue;
    // Re-entry only after a Drop-off (ended Visit with last path recorded).
    if (!prior.dropOffPath) continue;
    const start = Date.parse(visit.startedAt);
    const end = Date.parse(prior.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < end) continue;
    hits.push({
      visitId: visit.id,
      visitorId: visit.visitorId,
      landingPath: landing,
      priorVisitId: prior.id,
      priorDropOffPath: prior.dropOffPath,
      priorEndedAt: prior.endedAt,
      returnedAt: visit.startedAt,
      gapMs: start - end,
    });
  }
  hits.sort((a, b) => a.returnedAt.localeCompare(b.returnedAt));
  return hits;
}

/** Dashed Drop-off → landing edges (unique-node; no multi-day spaghetti). */
export function buildReentryEdges(
  returns: ReturnHit[],
  opts?: { countryByVisitId?: Map<string, string> },
): JourneyEdge[] {
  const counts = new Map<string, number>();
  for (const r of returns) {
    const country = opts?.countryByVisitId?.get(r.visitId);
    const key = country ? `${r.landingPath}\0${country}` : r.landingPath;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [to, country] = key.includes("\0") ? key.split("\0") : [key, undefined];
      return {
        from: DROP_OFF_NODE,
        to: to!,
        count,
        dashed: true as const,
        ...(country ? { country } : {}),
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.to.localeCompare(b.to) ||
        (a.country ?? "").localeCompare(b.country ?? ""),
    );
}

export function returnMetricsByPath(returns: ReturnHit[]): Map<
  string,
  { returnHits: number; medianReturnGapMs: number | null }
> {
  const gaps = new Map<string, number[]>();
  for (const r of returns) {
    const arr = gaps.get(r.landingPath) ?? [];
    arr.push(r.gapMs);
    gaps.set(r.landingPath, arr);
  }
  const out = new Map<string, { returnHits: number; medianReturnGapMs: number | null }>();
  for (const [path, arr] of gaps) {
    out.set(path, { returnHits: arr.length, medianReturnGapMs: median(arr) });
  }
  return out;
}

export function returnsForPath(returns: ReturnHit[], path: string): ReturnHit[] {
  return returns.filter((r) => r.landingPath === path);
}

/** Visit ids matching New/Returning cohort (needs full visitor history). */
export function filterVisitIdsByCohort(
  rangeVisits: VisitMeta[],
  allVisits: VisitMeta[],
  cohort: VisitorCohort | null,
): string[] | null {
  if (!cohort) return null;
  const byVisitor = new Map<string, VisitMeta[]>();
  for (const v of allVisits) {
    const list = byVisitor.get(v.visitorId) ?? [];
    list.push(v);
    byVisitor.set(v.visitorId, list);
  }
  return rangeVisits
    .filter((v) => classifyVisitCohort(v, byVisitor.get(v.visitorId) ?? []) === cohort)
    .map((v) => v.id);
}
