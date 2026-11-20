import type { JourneyEdge, JourneyNode } from "./transitions";

export const ENTRY_PREFIX = "__entry__:";
export const DIRECT_ENTRY = "Direct";
export const OTHER_ENTRY = "Other";
export const DEFAULT_ENTRY_TOP_N = 5;

export type EntryFeed = {
  entrySource: string | null;
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
  const edgeCounts = new Map<string, number>();
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
