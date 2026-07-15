export type PageViewEvent = {
  visitId: string;
  path: string;
  occurredAt: string;
};

export type JourneyNode = { path: string; views: number };
export type JourneyEdge = { from: string; to: string; count: number };

/** Build unique-node page→page transitions from ordered page_view rows. */
export function buildPageTransitions(events: PageViewEvent[]): {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
} {
  const views = new Map<string, number>();
  const edgeCounts = new Map<string, number>();

  const byVisit = new Map<string, PageViewEvent[]>();
  for (const e of events) {
    if (!e.path) continue;
    views.set(e.path, (views.get(e.path) ?? 0) + 1);
    const list = byVisit.get(e.visitId) ?? [];
    list.push(e);
    byVisit.set(e.visitId, list);
  }

  for (const list of byVisit.values()) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1]!.path;
      const to = list[i]!.path;
      if (from === to) continue; // same-path refresh is not a transition
      const key = `${from}\0${to}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  const nodes = [...views.entries()]
    .map(([path, v]) => ({ path, views: v }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));

  const edges = [...edgeCounts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("\0");
      return { from: from!, to: to!, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  return { nodes, edges };
}

export type SectionViewEvent = {
  visitId: string;
  path: string;
  sectionId: string;
  occurredAt: string;
};

export type SectionNode = {
  path: string;
  sectionId: string;
  views: number;
  dropOffs: number;
};

export type SectionEdge = {
  path: string;
  fromSection: string;
  toSection: string;
  count: number;
};

/** Section nodes + consecutive section_view edges within each page path. */
export function buildSectionTransitions(
  events: SectionViewEvent[],
  dropOffs: { path: string; sectionId: string; count: number }[] = [],
): { nodes: SectionNode[]; edges: SectionEdge[] } {
  const views = new Map<string, number>(); // path\0section
  const edgeCounts = new Map<string, number>(); // path\0from\0to
  const byVisitPath = new Map<string, SectionViewEvent[]>();

  for (const e of events) {
    if (!e.path || !e.sectionId) continue;
    const nk = `${e.path}\0${e.sectionId}`;
    views.set(nk, (views.get(nk) ?? 0) + 1);
    const vk = `${e.visitId}\0${e.path}`;
    const list = byVisitPath.get(vk) ?? [];
    list.push(e);
    byVisitPath.set(vk, list);
  }

  for (const list of byVisitPath.values()) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1]!.sectionId;
      const to = list[i]!.sectionId;
      if (from === to) continue;
      const path = list[i]!.path;
      const key = `${path}\0${from}\0${to}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  const dropMap = new Map<string, number>();
  for (const d of dropOffs) {
    if (!d.path || !d.sectionId || d.count <= 0) continue;
    const k = `${d.path}\0${d.sectionId}`;
    dropMap.set(k, (dropMap.get(k) ?? 0) + d.count);
  }

  // Include drop-off-only sections so expand still shows the sink block.
  for (const k of dropMap.keys()) {
    if (!views.has(k)) views.set(k, 0);
  }

  const nodes = [...views.entries()]
    .map(([key, v]) => {
      const [path, sectionId] = key.split("\0");
      return {
        path: path!,
        sectionId: sectionId!,
        views: v,
        dropOffs: dropMap.get(key) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        b.views - a.views ||
        a.sectionId.localeCompare(b.sectionId),
    );

  const edges = [...edgeCounts.entries()]
    .map(([key, count]) => {
      const [path, fromSection, toSection] = key.split("\0");
      return { path: path!, fromSection: fromSection!, toSection: toSection!, count };
    })
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        b.count - a.count ||
        a.fromSection.localeCompare(b.fromSection),
    );

  return { nodes, edges };
}

/**
 * Expand one page into section child nodes (`path#sectionId`).
 * Page node stays; collapse = omit expandPath (page-only graph).
 */
export function expandPageToSections(
  pageGraph: { nodes: JourneyNode[]; edges: JourneyEdge[] },
  sectionGraph: { nodes: SectionNode[]; edges: SectionEdge[] },
  expandPath: string,
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  const sectionNodes = sectionGraph.nodes.filter((n) => n.path === expandPath);
  if (sectionNodes.length === 0) return pageGraph;

  const nodeId = (sectionId: string) => `${expandPath}#${sectionId}`;

  const nodes: JourneyNode[] = [
    ...pageGraph.nodes,
    ...sectionNodes.map((n) => ({
      path: nodeId(n.sectionId),
      views: n.views,
    })),
  ];

  const edges: JourneyEdge[] = [...pageGraph.edges];
  for (const e of sectionGraph.edges) {
    if (e.path !== expandPath) continue;
    edges.push({
      from: nodeId(e.fromSection),
      to: nodeId(e.toSection),
      count: e.count,
    });
  }

  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  edges.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  return { nodes, edges };
}
