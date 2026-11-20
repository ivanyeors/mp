export const DIVE_ENTRY = "__dive_entry__";
export const DIVE_EXIT = "__dive_exit__";

export type DiveNode = { path: string; views: number };
export type DiveEdge = {
  from: string;
  to: string;
  count: number;
  dashed?: boolean;
  country?: string;
};

export function isDivePort(path: string) {
  return path === DIVE_ENTRY || path === DIVE_EXIT;
}

export function buildDiveGraph(
  pagePath: string,
  nodes: DiveNode[],
  edges: DiveEdge[],
): { nodes: DiveNode[]; edges: DiveEdge[] } {
  const prefix = `${pagePath}#`;
  const sections = nodes.filter((n) => n.path.startsWith(prefix));
  if (sections.length === 0) {
    return { nodes: [], edges: [] };
  }

  const sectionEdges = edges.filter(
    (e) => e.from.startsWith(prefix) && e.to.startsWith(prefix),
  );

  const inbound = new Set(sectionEdges.map((e) => e.to));
  const outbound = new Set(sectionEdges.map((e) => e.from));
  const sources = sections.filter((n) => !inbound.has(n.path));
  const sinks = sections.filter((n) => !outbound.has(n.path));
  const entryTargets = sources.length > 0 ? sources : sections;
  const exitSources = sinks.length > 0 ? sinks : sections;

  const pageIn = edges
    .filter(
      (e) =>
        e.to === pagePath && !e.from.startsWith(prefix) && e.from !== pagePath,
    )
    .reduce((s, e) => s + e.count, 0);
  const pageOut = edges
    .filter(
      (e) =>
        e.from === pagePath && !e.to.startsWith(prefix) && e.to !== pagePath,
    )
    .reduce((s, e) => s + e.count, 0);

  const entryViews =
    pageIn > 0 ? pageIn : entryTargets.reduce((s, n) => s + n.views, 0);
  const exitViews =
    pageOut > 0 ? pageOut : exitSources.reduce((s, n) => s + n.views, 0);

  const diveNodes: DiveNode[] = [
    { path: DIVE_ENTRY, views: entryViews },
    ...sections,
    { path: DIVE_EXIT, views: exitViews },
  ];

  const diveEdges: DiveEdge[] = [...sectionEdges];
  const perEntry = Math.max(1, Math.round(entryViews / entryTargets.length));
  for (const n of entryTargets) {
    diveEdges.push({ from: DIVE_ENTRY, to: n.path, count: perEntry });
  }
  const perExit = Math.max(1, Math.round(exitViews / exitSources.length));
  for (const n of exitSources) {
    diveEdges.push({ from: n.path, to: DIVE_EXIT, count: perExit });
  }

  diveNodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  diveEdges.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  return { nodes: diveNodes, edges: diveEdges };
}

export function layoutDiveGraph(
  nodes: DiveNode[],
  width: number,
  height: number,
): (DiveNode & { x: number; y: number })[] {
  const entry = nodes.find((n) => n.path === DIVE_ENTRY);
  const exit = nodes.find((n) => n.path === DIVE_EXIT);
  const sections = nodes.filter((n) => !isDivePort(n.path));
  const cy = height * 0.5;
  const laid: (DiveNode & { x: number; y: number })[] = [];
  if (entry) laid.push({ ...entry, x: width * 0.12, y: cy });
  const n = Math.max(1, sections.length);
  const x0 = width * 0.38;
  const x1 = width * 0.62;
  sections.forEach((s, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * t;
    const y =
      n === 1 ? cy : cy + (i - (n - 1) / 2) * Math.min(72, (height * 0.55) / n);
    laid.push({ ...s, x, y });
  });
  if (exit) laid.push({ ...exit, x: width * 0.88, y: cy });
  return laid;
}
