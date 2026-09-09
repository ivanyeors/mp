/**
 * Aggregated entry points — Visit Entry sources collapsed into a source column
 * that feeds the landing page of each Visit. Mirrors the Drop-off / Converted
 * sinks at the other end: the page→page journey itself is untouched, the graph
 * just gains a "where did they arrive from" column on the left.
 */
import type { JourneyEdge, JourneyNode } from "./transitions";

export const ENTRY_PREFIX = "__entry__:";
export const DIRECT_ENTRY = "Direct";
/** Long tail below the top-N cut, so the column stays readable. */
export const OTHER_ENTRY = "Other";
export const DEFAULT_ENTRY_TOP_N = 5;

export type EntryFeed = {
  /** Visit.entry_source; null/blank = Direct. */
  entrySource: string | null;
  /** First page of the Visit. */
  landingPath: string;
  count: number;
  country?: string;
};

export function entryNodePath(source: string): string {
  return `${ENTRY_PREFIX}${source}`;
}

export function isEntryNode(path: string): boolean {
  return path.startsWith(ENTRY_PREFIX);
}

export function entrySourceOf(path: string): string | null {
  return isEntryNode(path) ? path.slice(ENTRY_PREFIX.length) : null;
}

export function normalizeEntrySource(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : DIRECT_ENTRY;
}

/**
 * Visits per source, and which sources fall past the top-N cut into "Other".
 * Shared by the graph column and the "Other" node's breakdown so the two can
 * never disagree about what got rolled up.
 */
export function rankEntrySources(
  feeds: EntryFeed[],
  topN = DEFAULT_ENTRY_TOP_N,
): { totals: Map<string, number>; kept: string[]; rolled: string[] } {
  const totals = new Map<string, number>();
  for (const f of feeds) {
    if (f.count <= 0) continue;
    const s = normalizeEntrySource(f.entrySource);
    totals.set(s, (totals.get(s) ?? 0) + f.count);
  }
  const ranked = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([s]) => s);
  if (topN <= 0 || ranked.length <= topN) {
    return { totals, kept: ranked, rolled: [] };
  }
  return {
    totals,
    kept: ranked.slice(0, topN),
    rolled: ranked.slice(topN),
  };
}

/**
 * Add one node per Entry source (top-N by Visits, rest rolled into "Other")
 * plus source→landing edges. Feeds whose landing page is not in the graph are
 * dropped so no edge dangles.
 */
export function attachEntrySources(
  graph: { nodes: JourneyNode[]; edges: JourneyEdge[] },
  feeds: EntryFeed[],
  opts?: { topN?: number },
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  const pagePaths = new Set(graph.nodes.map((n) => n.path));
  const valid = feeds.filter(
    (f) => f.count > 0 && f.landingPath && pagePaths.has(f.landingPath),
  );
  if (valid.length === 0) return graph;

  const { kept: keptList } = rankEntrySources(valid, opts?.topN ?? DEFAULT_ENTRY_TOP_N);
  const kept = new Set(keptList);

  const views = new Map<string, number>();
  const edgeCounts = new Map<string, number>(); // source \0 landing \0 country
  for (const f of valid) {
    const raw = normalizeEntrySource(f.entrySource);
    const s = kept.has(raw) ? raw : OTHER_ENTRY;
    views.set(s, (views.get(s) ?? 0) + f.count);
    const key = `${s}\0${f.landingPath}\0${f.country ?? ""}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + f.count);
  }

  const nodes = [...graph.nodes];
  for (const [s, v] of views) nodes.push({ path: entryNodePath(s), views: v });

  const edges = [...graph.edges];
  for (const [key, count] of edgeCounts) {
    const [s, landingPath, country] = key.split("\0");
    edges.push({
      from: entryNodePath(s!),
      to: landingPath!,
      count,
      ...(country ? { country } : {}),
    });
  }

  edges.sort(
    (a, b) =>
      b.count - a.count ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      (a.country ?? "").localeCompare(b.country ?? ""),
  );
  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  return { nodes, edges };
}
