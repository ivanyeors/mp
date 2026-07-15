import type { JourneyEdge, JourneyNode } from "./transitions";

export const DROP_OFF_NODE = "__drop_off__";

export type DropOffFeed = { lastPath: string; count: number; country?: string };

/** Add Drop-off sink node + edges from last pages of ended Visits. */
export function attachDropOffSink(
  graph: { nodes: JourneyNode[]; edges: JourneyEdge[] },
  feeds: DropOffFeed[],
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  if (feeds.length === 0) return graph;

  let sinkViews = 0;
  const edgeCounts = new Map<string, number>(); // from[\0country?]
  for (const f of feeds) {
    if (!f.lastPath || f.count <= 0) continue;
    sinkViews += f.count;
    const key = f.country ? `${f.lastPath}\0${f.country}` : f.lastPath;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + f.count);
  }
  if (sinkViews === 0) return graph;

  const nodes = [...graph.nodes];
  if (!nodes.some((n) => n.path === DROP_OFF_NODE)) {
    nodes.push({ path: DROP_OFF_NODE, views: sinkViews });
  } else {
    const n = nodes.find((n) => n.path === DROP_OFF_NODE)!;
    n.views += sinkViews;
  }

  const edges = [...graph.edges];
  for (const [key, count] of edgeCounts) {
    const [from, country] = key.includes("\0") ? key.split("\0") : [key, undefined];
    const existing = edges.find(
      (e) =>
        e.from === from &&
        e.to === DROP_OFF_NODE &&
        (e.country ?? undefined) === country,
    );
    if (existing) existing.count += count;
    else {
      edges.push({
        from: from!,
        to: DROP_OFF_NODE,
        count,
        ...(country ? { country } : {}),
      });
    }
  }

  edges.sort(
    (a, b) =>
      b.count - a.count ||
      a.from.localeCompare(b.from) ||
      (a.country ?? "").localeCompare(b.country ?? ""),
  );
  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  return { nodes, edges };
}
