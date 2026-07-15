import type { JourneyEdge, JourneyNode } from "./transitions";

export const DROP_OFF_NODE = "__drop_off__";

export type DropOffFeed = { lastPath: string; count: number };

/** Add Drop-off sink node + edges from last pages of ended Visits. */
export function attachDropOffSink(
  graph: { nodes: JourneyNode[]; edges: JourneyEdge[] },
  feeds: DropOffFeed[],
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  if (feeds.length === 0) return graph;

  let sinkViews = 0;
  const edgeCounts = new Map<string, number>();
  for (const f of feeds) {
    if (!f.lastPath || f.count <= 0) continue;
    sinkViews += f.count;
    edgeCounts.set(f.lastPath, (edgeCounts.get(f.lastPath) ?? 0) + f.count);
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
  for (const [from, count] of edgeCounts) {
    const existing = edges.find((e) => e.from === from && e.to === DROP_OFF_NODE);
    if (existing) existing.count += count;
    else edges.push({ from, to: DROP_OFF_NODE, count });
  }

  edges.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  return { nodes, edges };
}
