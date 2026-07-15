import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNodeChrome,
  buildNodeSidePanel,
  type NodeSidePanel,
  type PageNodeChrome,
} from "./chrome";
import { attachDropOffSink } from "./drop-off-sink";
import {
  buildPageTransitions,
  buildSectionTransitions,
  expandPageToSections,
  type JourneyEdge,
  type PageViewEvent,
  type SectionEdge,
  type SectionNode,
} from "./transitions";

export async function listEntrySourcesFromDb(
  db: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await db
    .from("analytics_visits")
    .select("entry_source")
    .not("entry_source", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const s = row.entry_source as string | null;
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

async function loadSectionGraphFromDb(
  db: SupabaseClient,
  opts: { from: string; to: string; visitIds: string[] | null },
): Promise<{ nodes: SectionNode[]; edges: SectionEdge[] }> {
  let q = db
    .from("analytics_events")
    .select("visit_id, path, section_id, occurred_at")
    .eq("type", "section_view")
    .gte("occurred_at", opts.from)
    .lte("occurred_at", opts.to)
    .order("occurred_at", { ascending: true })
    .limit(5000);
  if (opts.visitIds) q = q.in("visit_id", opts.visitIds);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let dropQ = db
    .from("analytics_visits")
    .select("drop_off_path, drop_off_section")
    .not("drop_off_path", "is", null)
    .not("drop_off_section", "is", null)
    .not("ended_at", "is", null)
    .gte("started_at", opts.from)
    .lte("started_at", opts.to)
    .limit(5000);
  if (opts.visitIds) dropQ = dropQ.in("id", opts.visitIds);

  const { data: dropped, error: dErr } = await dropQ;
  if (dErr) throw new Error(dErr.message);

  const dropCounts = new Map<string, number>();
  for (const row of dropped ?? []) {
    const path = row.drop_off_path as string;
    const sectionId = row.drop_off_section as string;
    if (!path || !sectionId) continue;
    const k = `${path}\0${sectionId}`;
    dropCounts.set(k, (dropCounts.get(k) ?? 0) + 1);
  }

  return buildSectionTransitions(
    (data ?? [])
      .filter((row) => row.section_id)
      .map((row) => ({
        visitId: row.visit_id as string,
        path: row.path as string,
        sectionId: row.section_id as string,
        occurredAt: row.occurred_at as string,
      })),
    [...dropCounts.entries()].map(([key, count]) => {
      const [path, sectionId] = key.split("\0");
      return { path: path!, sectionId: sectionId!, count };
    }),
  );
}

export async function loadPageTransitionsFromDb(
  db: SupabaseClient,
  opts: {
    from: string;
    to: string;
    entrySource?: string | null;
    /** When set, replace that page node with its section children. */
    expandPath?: string | null;
    /** When set, include side-panel detail for this page node. */
    detailPath?: string | null;
  },
): Promise<{
  nodes: PageNodeChrome[];
  edges: JourneyEdge[];
  sections: SectionNode[];
  sectionEdges: SectionEdge[];
  expandablePaths: string[];
  detail: NodeSidePanel | null;
}> {
  let visitIds: string[] | null = null;
  if (opts.entrySource) {
    const { data: visits, error: vErr } = await db
      .from("analytics_visits")
      .select("id")
      .eq("entry_source", opts.entrySource)
      .limit(5000);
    if (vErr) throw new Error(vErr.message);
    visitIds = (visits ?? []).map((v) => v.id as string);
    if (visitIds.length === 0) {
      return {
        nodes: [],
        edges: [],
        sections: [],
        sectionEdges: [],
        expandablePaths: [],
        detail: null,
      };
    }
  }

  let q = db
    .from("analytics_events")
    .select("visit_id, path, occurred_at")
    .eq("type", "page_view")
    .gte("occurred_at", opts.from)
    .lte("occurred_at", opts.to)
    .order("occurred_at", { ascending: true })
    .limit(5000);

  if (visitIds) q = q.in("visit_id", visitIds);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const events: PageViewEvent[] = (data ?? []).map((row) => ({
    visitId: row.visit_id as string,
    path: row.path as string,
    occurredAt: row.occurred_at as string,
  }));
  const graph = buildPageTransitions(events);

  let dropQ = db
    .from("analytics_visits")
    .select("id, drop_off_path, drop_off_section, ended_at")
    .not("drop_off_path", "is", null)
    .not("ended_at", "is", null)
    .gte("started_at", opts.from)
    .lte("started_at", opts.to)
    .limit(5000);
  if (visitIds) dropQ = dropQ.in("id", visitIds);

  const { data: dropped, error: dErr } = await dropQ;
  if (dErr) throw new Error(dErr.message);

  const feedMap = new Map<string, number>();
  const topSectionCount = new Map<string, Map<string, number>>();
  const visitEndedAt = new Map<string, string>();
  for (const row of dropped ?? []) {
    const p = row.drop_off_path as string;
    if (!p) continue;
    feedMap.set(p, (feedMap.get(p) ?? 0) + 1);
    const section = row.drop_off_section as string | null;
    if (section) {
      const inner = topSectionCount.get(p) ?? new Map();
      inner.set(section, (inner.get(section) ?? 0) + 1);
      topSectionCount.set(p, inner);
    }
    if (row.id && row.ended_at) {
      visitEndedAt.set(row.id as string, row.ended_at as string);
    }
  }
  // Also load ended_at for non-drop visits in range (dwell on last page).
  let endQ = db
    .from("analytics_visits")
    .select("id, ended_at")
    .not("ended_at", "is", null)
    .gte("started_at", opts.from)
    .lte("started_at", opts.to)
    .limit(5000);
  if (visitIds) endQ = endQ.in("id", visitIds);
  const { data: endedRows } = await endQ;
  for (const row of endedRows ?? []) {
    if (row.id && row.ended_at) {
      visitEndedAt.set(row.id as string, row.ended_at as string);
    }
  }

  const topSectionByPath = new Map<string, string>();
  for (const [path, inner] of topSectionCount) {
    let best: string | null = null;
    let bestN = 0;
    for (const [section, n] of inner) {
      if (n > bestN || (n === bestN && (!best || section.localeCompare(best) < 0))) {
        best = section;
        bestN = n;
      }
    }
    if (best) topSectionByPath.set(path, best);
  }

  const feeds = [...feedMap.entries()].map(([lastPath, count]) => ({ lastPath, count }));
  const withSink = attachDropOffSink(graph, feeds);

  const sectionGraph = await loadSectionGraphFromDb(db, {
    from: opts.from,
    to: opts.to,
    visitIds,
  });
  const expandablePaths = [
    ...new Set(sectionGraph.nodes.map((n) => n.path)),
  ].sort((a, b) => a.localeCompare(b));

  const expandPath = opts.expandPath?.trim() || null;
  const expanded =
    expandPath && expandablePaths.includes(expandPath)
      ? expandPageToSections(withSink, sectionGraph, expandPath)
      : withSink;

  // Section child nodes keep thin chrome (views only); page nodes get full chrome.
  const pageChrome = buildNodeChrome({
    nodes: withSink.nodes,
    events,
    dropOffsByPath: feedMap,
    topSectionByPath,
    visitEndedAt,
  });
  const chromeByPath = new Map(pageChrome.map((n) => [n.path, n]));
  const nodes: PageNodeChrome[] = expanded.nodes.map((n) => {
    const existing = chromeByPath.get(n.path);
    if (existing) return existing;
    // Expanded section child (`/#hero`) — thin chrome until section chrome lands.
    return {
      path: n.path,
      views: n.views,
      prospects: n.views,
      dropOffs: 0,
      dropOffPct: 0,
      medianDwellMs: null,
      topDropOffSection: null,
      returnHits: null,
      medianReturnGapMs: null,
    };
  });

  const detailPath = opts.detailPath?.trim() || null;
  let detail: NodeSidePanel | null = null;
  if (detailPath && detailPath !== "__drop_off__") {
    const exitSections = sectionGraph.nodes
      .filter((s) => s.path === detailPath && s.dropOffs > 0)
      .map((s) => ({ sectionId: s.sectionId, count: s.dropOffs }));
    detail = buildNodeSidePanel({
      path: detailPath,
      events,
      exitSections,
      visitEndedAt,
    });
  }

  return {
    nodes,
    edges: expanded.edges,
    sections: sectionGraph.nodes,
    sectionEdges: sectionGraph.edges,
    expandablePaths,
    detail,
  };
}
