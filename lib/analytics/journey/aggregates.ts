import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNodeChrome,
  buildNodeSidePanel,
  type NodeSidePanel,
  type PageNodeChrome,
} from "./chrome";
import {
  attachConvertedSink,
  buildConvertedRecords,
  buildConvertedSinkDetail,
  collectConvertedFeeds,
  CONVERTED_NODE,
  isProspectVisit,
  type ConvertedSinkDetail,
  type ConvertedVisitRow,
} from "./converted-sink";
import { attachDropOffSink, DROP_OFF_NODE } from "./drop-off-sink";
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

async function loadConvertedRecordsFromDb(
  db: SupabaseClient,
  opts: { from: string; to: string; convertedVisits: ConvertedVisitRow[] },
): Promise<ReturnType<typeof buildConvertedRecords>> {
  if (opts.convertedVisits.length === 0) return [];

  const orderIds = [
    ...new Set(opts.convertedVisits.map((v) => v.converted_order_id)),
  ];
  const { data: orders, error: oErr } = await db
    .from("orders")
    .select("id, paid_at, total")
    .in("id", orderIds)
    .not("paid_at", "is", null)
    .limit(5000);
  if (oErr) throw new Error(oErr.message);

  const orderMap = new Map<string, { paid_at: string; total: number }>();
  for (const row of orders ?? []) {
    if (row.id && row.paid_at != null) {
      orderMap.set(row.id as string, {
        paid_at: row.paid_at as string,
        total: Number(row.total),
      });
    }
  }

  const convertedIds = opts.convertedVisits.map((v) => v.id);
  const { data: convEvents, error: eErr } = await db
    .from("analytics_events")
    .select("visit_id, path, occurred_at")
    .eq("type", "page_view")
    .in("visit_id", convertedIds)
    .order("occurred_at", { ascending: true })
    .limit(5000);
  if (eErr) throw new Error(eErr.message);

  const eventsByVisit = new Map<string, PageViewEvent[]>();
  for (const row of convEvents ?? []) {
    const visitId = row.visit_id as string;
    const list = eventsByVisit.get(visitId) ?? [];
    list.push({
      visitId,
      path: row.path as string,
      occurredAt: row.occurred_at as string,
    });
    eventsByVisit.set(visitId, list);
  }

  return buildConvertedRecords({
    visits: opts.convertedVisits,
    orders: orderMap,
    eventsByVisit,
  });
}

export async function loadPageTransitionsFromDb(
  db: SupabaseClient,
  opts: {
    from: string;
    to: string;
    entrySource?: string | null;
    /** When true, attach muted Converted sink (default Prospect cohort). */
    includeConverted?: boolean;
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
  convertedDetail: ConvertedSinkDetail | null;
}> {
  let visitQ = db
    .from("analytics_visits")
    .select("id, converted_order_id, entry_source, started_at")
    .gte("started_at", opts.from)
    .lte("started_at", opts.to)
    .limit(5000);
  if (opts.entrySource) visitQ = visitQ.eq("entry_source", opts.entrySource);

  const { data: visitRows, error: vErr } = await visitQ;
  if (vErr) throw new Error(vErr.message);

  const prospectVisitIds = (visitRows ?? [])
    .filter((v) => isProspectVisit(v.converted_order_id as string | null))
    .map((v) => v.id as string);
  const convertedVisits: ConvertedVisitRow[] = (visitRows ?? [])
    .filter((v) => !isProspectVisit(v.converted_order_id as string | null))
    .map((v) => ({
      id: v.id as string,
      entry_source: (v.entry_source as string | null) ?? null,
      started_at: v.started_at as string,
      converted_order_id: v.converted_order_id as string,
    }));

  if (prospectVisitIds.length === 0 && (!opts.includeConverted || convertedVisits.length === 0)) {
    return {
      nodes: [],
      edges: [],
      sections: [],
      sectionEdges: [],
      expandablePaths: [],
      detail: null,
      convertedDetail: null,
    };
  }

  let events: PageViewEvent[] = [];
  if (prospectVisitIds.length > 0) {
    const { data, error } = await db
      .from("analytics_events")
      .select("visit_id, path, occurred_at")
      .eq("type", "page_view")
      .gte("occurred_at", opts.from)
      .lte("occurred_at", opts.to)
      .in("visit_id", prospectVisitIds)
      .order("occurred_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    events = (data ?? []).map((row) => ({
      visitId: row.visit_id as string,
      path: row.path as string,
      occurredAt: row.occurred_at as string,
    }));
  }
  const graph = buildPageTransitions(events);

  let dropped: { id?: string; drop_off_path?: string; drop_off_section?: string; ended_at?: string }[] = [];
  if (prospectVisitIds.length > 0) {
    const { data, error: dErr } = await db
      .from("analytics_visits")
      .select("id, drop_off_path, drop_off_section, ended_at")
      .not("drop_off_path", "is", null)
      .not("ended_at", "is", null)
      .gte("started_at", opts.from)
      .lte("started_at", opts.to)
      .in("id", prospectVisitIds)
      .limit(5000);
    if (dErr) throw new Error(dErr.message);
    dropped = data ?? [];
  }

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
  if (prospectVisitIds.length > 0) {
    const { data: endedRows } = await db
      .from("analytics_visits")
      .select("id, ended_at")
      .not("ended_at", "is", null)
      .gte("started_at", opts.from)
      .lte("started_at", opts.to)
      .in("id", prospectVisitIds)
      .limit(5000);
    for (const row of endedRows ?? []) {
      if (row.id && row.ended_at) {
        visitEndedAt.set(row.id as string, row.ended_at as string);
      }
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
  let withSink = attachDropOffSink(graph, feeds);

  let convertedRecords: ReturnType<typeof buildConvertedRecords> = [];
  if (opts.includeConverted && convertedVisits.length > 0) {
    convertedRecords = await loadConvertedRecordsFromDb(db, {
      from: opts.from,
      to: opts.to,
      convertedVisits,
    });
    withSink = attachConvertedSink(withSink, collectConvertedFeeds(convertedRecords));
  }

  const sectionGraph = await loadSectionGraphFromDb(db, {
    from: opts.from,
    to: opts.to,
    visitIds: prospectVisitIds.length > 0 ? prospectVisitIds : null,
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
  let convertedDetail: ConvertedSinkDetail | null = null;
  if (detailPath === CONVERTED_NODE) {
    convertedDetail = buildConvertedSinkDetail(convertedRecords);
  } else if (detailPath && detailPath !== DROP_OFF_NODE && detailPath !== CONVERTED_NODE) {
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
    convertedDetail,
  };
}
