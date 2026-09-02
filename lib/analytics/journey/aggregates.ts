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
import { buildCountryLegend, UNKNOWN_COUNTRY } from "./country";
import { attachDropOffSink, DROP_OFF_NODE } from "./drop-off-sink";
import {
  buildReentryEdges,
  collectReturns,
  filterVisitIdsByCohort,
  returnMetricsByPath,
  returnsForPath,
  type VisitMeta,
  type VisitorCohort,
} from "./returns";
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

export async function listCountriesFromDb(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("analytics_visits")
    .select("country")
    .limit(5000);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const c = (row.country as string | null)?.trim();
    set.add(c && c.length > 0 ? c : UNKNOWN_COUNTRY);
  }
  return [...set].sort((a, b) => {
    if (a === UNKNOWN_COUNTRY) return 1;
    if (b === UNKNOWN_COUNTRY) return -1;
    return a.localeCompare(b);
  });
}

function rowToVisitMeta(row: {
  id: unknown;
  visitor_id: unknown;
  started_at: unknown;
  ended_at: unknown;
  drop_off_path: unknown;
  country?: unknown;
}): VisitMeta & { country: string } {
  const raw = (row.country as string | null)?.trim();
  return {
    id: row.id as string,
    visitorId: row.visitor_id as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
    dropOffPath: (row.drop_off_path as string | null) ?? null,
    country: raw && raw.length > 0 ? raw : UNKNOWN_COUNTRY,
  };
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

/** First page_view path per Visit (return landing). */
function landingsFromEvents(events: PageViewEvent[]): Map<string, string> {
  const byVisit = new Map<string, PageViewEvent[]>();
  for (const e of events) {
    if (!e.path || e.path === DROP_OFF_NODE || e.path === CONVERTED_NODE) continue;
    const list = byVisit.get(e.visitId) ?? [];
    list.push(e);
    byVisit.set(e.visitId, list);
  }
  const landings = new Map<string, string>();
  for (const [visitId, list] of byVisit) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const first = list[0];
    if (first) landings.set(visitId, first.path);
  }
  return landings;
}

function attachReentryEdges(
  graph: { nodes: { path: string; views: number }[]; edges: JourneyEdge[] },
  reentry: JourneyEdge[],
): { nodes: { path: string; views: number }[]; edges: JourneyEdge[] } {
  if (reentry.length === 0) return graph;
  const nodes = [...graph.nodes];
  if (!nodes.some((n) => n.path === DROP_OFF_NODE)) {
    nodes.push({ path: DROP_OFF_NODE, views: 0 });
  }
  const edges = [...graph.edges, ...reentry];
  edges.sort(
    (a, b) =>
      b.count - a.count ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      Number(!!a.dashed) - Number(!!b.dashed),
  );
  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  return { nodes, edges };
}

async function loadConvertedRecordsFromDb(
  db: SupabaseClient,
  opts: { convertedVisits: ConvertedVisitRow[] },
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

const emptyGraph = {
  nodes: [] as PageNodeChrome[],
  edges: [] as JourneyEdge[],
  sections: [] as SectionNode[],
  sectionEdges: [] as SectionEdge[],
  expandablePaths: [] as string[],
  detail: null as NodeSidePanel | null,
  countryLegend: [] as { code: string; color: string }[],
  convertedDetail: null as ConvertedSinkDetail | null,
};

export async function loadPageTransitionsFromDb(
  db: SupabaseClient,
  opts: {
    from: string;
    to: string;
    entrySource?: string | null;
    /** new = first Visit for Visitor; returning = prior ended Visit exists. */
    visitorCohort?: VisitorCohort | null;
    /** Multi-select ISO countries (Unknown allowed). Empty/omit = all. */
    countries?: string[] | null;
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
  /** Non-empty when ≥2 countries selected (color-by-country mode). */
  countryLegend: { code: string; color: string }[];
  convertedDetail: ConvertedSinkDetail | null;
}> {
  const selectedCountries = [
    ...new Set((opts.countries ?? []).map((c) => c.trim()).filter(Boolean)),
  ];
  const colorByCountry = selectedCountries.length >= 2;

  let rangeQ = db
    .from("analytics_visits")
    .select(
      "id, visitor_id, started_at, ended_at, drop_off_path, entry_source, country, converted_order_id",
    )
    .gte("started_at", opts.from)
    .lte("started_at", opts.to)
    .limit(5000);
  if (opts.entrySource) rangeQ = rangeQ.eq("entry_source", opts.entrySource);

  const { data: rangeRows, error: rangeErr } = await rangeQ;
  if (rangeErr) throw new Error(rangeErr.message);

  type RangeRow = {
    id: string;
    visitor_id: string;
    started_at: string;
    ended_at: string | null;
    drop_off_path: string | null;
    entry_source: string | null;
    country: string | null;
    converted_order_id: string | null;
  };

  let rangeRaw = (rangeRows ?? []) as RangeRow[];
  if (selectedCountries.length > 0) {
    const want = new Set(selectedCountries);
    rangeRaw = rangeRaw.filter((row) => {
      const raw = row.country?.trim();
      const c = raw && raw.length > 0 ? raw : UNKNOWN_COUNTRY;
      return want.has(c);
    });
  }

  const convertedVisits: ConvertedVisitRow[] = rangeRaw
    .filter((v) => !isProspectVisit(v.converted_order_id))
    .map((v) => ({
      id: v.id,
      entry_source: v.entry_source,
      started_at: v.started_at,
      converted_order_id: v.converted_order_id as string,
    }));

  // Prospect cohort excludes paid Visits (slice 10).
  const rangeVisits = rangeRaw
    .filter((v) => isProspectVisit(v.converted_order_id))
    .map(rowToVisitMeta);

  if (
    rangeVisits.length === 0 &&
    (!opts.includeConverted || convertedVisits.length === 0)
  ) {
    return emptyGraph;
  }

  let allVisits: (VisitMeta & { country: string })[] = [];
  let visitIds: string[] = [];
  let focusVisitIds = new Set<string>();
  let countryByVisitId = new Map<string, string>();

  if (rangeVisits.length > 0) {
    const visitorIds = [...new Set(rangeVisits.map((v) => v.visitorId))];
    // Prior Visits may sit outside the date window — needed for Returning + gaps.
    const { data: histRows, error: histErr } = await db
      .from("analytics_visits")
      .select("id, visitor_id, started_at, ended_at, drop_off_path, country")
      .in("visitor_id", visitorIds)
      .limit(5000);
    if (histErr) throw new Error(histErr.message);
    allVisits = (histRows ?? []).map(rowToVisitMeta);

    const cohortIds = filterVisitIdsByCohort(
      rangeVisits,
      allVisits,
      opts.visitorCohort ?? null,
    );
    visitIds = cohortIds ?? rangeVisits.map((v) => v.id);
    if (visitIds.length === 0 && (!opts.includeConverted || convertedVisits.length === 0)) {
      return emptyGraph;
    }
    focusVisitIds = new Set(visitIds);
    countryByVisitId = new Map(rangeVisits.map((v) => [v.id, v.country]));
    for (const v of allVisits) {
      if (focusVisitIds.has(v.id) && !countryByVisitId.has(v.id)) {
        countryByVisitId.set(v.id, v.country);
      }
    }
  }

  let events: PageViewEvent[] = [];
  if (visitIds.length > 0) {
    const { data, error } = await db
      .from("analytics_events")
      .select("visit_id, path, occurred_at")
      .eq("type", "page_view")
      .gte("occurred_at", opts.from)
      .lte("occurred_at", opts.to)
      .in("visit_id", visitIds)
      .order("occurred_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    events = (data ?? []).map((row) => {
      const visitId = row.visit_id as string;
      return {
        visitId,
        path: row.path as string,
        occurredAt: row.occurred_at as string,
        ...(colorByCountry
          ? { country: countryByVisitId.get(visitId) ?? UNKNOWN_COUNTRY }
          : {}),
      };
    });
  }
  const graph = buildPageTransitions(events);

  let dropped: {
    id?: string;
    drop_off_path?: string | null;
    drop_off_section?: string | null;
    ended_at?: string | null;
    country?: string | null;
  }[] = [];
  if (visitIds.length > 0) {
    const { data, error: dErr } = await db
      .from("analytics_visits")
      .select("id, drop_off_path, drop_off_section, ended_at, country")
      .in("id", visitIds)
      .not("drop_off_path", "is", null)
      .not("ended_at", "is", null)
      .limit(5000);
    if (dErr) throw new Error(dErr.message);
    dropped = data ?? [];
  }

  const feedMap = new Map<string, number>();
  const topSectionCount = new Map<string, Map<string, number>>();
  const visitEndedAt = new Map<string, string>();
  const feeds: { lastPath: string; count: number; country?: string }[] = [];
  for (const row of dropped) {
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
    const raw = (row.country as string | null)?.trim();
    const country = raw && raw.length > 0 ? raw : UNKNOWN_COUNTRY;
    if (colorByCountry) feeds.push({ lastPath: p, count: 1, country });
  }
  if (!colorByCountry) {
    for (const [lastPath, count] of feedMap) feeds.push({ lastPath, count });
  }
  if (visitIds.length > 0) {
    const { data: endedRows } = await db
      .from("analytics_visits")
      .select("id, ended_at")
      .in("id", visitIds)
      .not("ended_at", "is", null)
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

  let withSink = attachDropOffSink(graph, feeds);

  let convertedRecords: ReturnType<typeof buildConvertedRecords> = [];
  if (opts.includeConverted && convertedVisits.length > 0) {
    convertedRecords = await loadConvertedRecordsFromDb(db, { convertedVisits });
    withSink = attachConvertedSink(withSink, collectConvertedFeeds(convertedRecords));
  }

  const landings = landingsFromEvents(events);
  const returns = collectReturns(allVisits, landings, focusVisitIds);
  const reentry = buildReentryEdges(
    returns,
    colorByCountry ? { countryByVisitId } : undefined,
  );
  const withReturns = attachReentryEdges(withSink, reentry);
  const returnByPath = returnMetricsByPath(returns);

  const sectionGraph = await loadSectionGraphFromDb(db, {
    from: opts.from,
    to: opts.to,
    visitIds: visitIds.length > 0 ? visitIds : null,
  });
  const expandablePaths = [
    ...new Set(sectionGraph.nodes.map((n) => n.path)),
  ].sort((a, b) => a.localeCompare(b));

  const expandPath = opts.expandPath?.trim() || null;
  const expanded =
    expandPath && expandablePaths.includes(expandPath)
      ? expandPageToSections(withReturns, sectionGraph, expandPath)
      : withReturns;

  const pageChrome = buildNodeChrome({
    nodes: withReturns.nodes,
    events,
    dropOffsByPath: feedMap,
    topSectionByPath,
    visitEndedAt,
    returnHitsByPath: returnByPath,
  });
  const chromeByPath = new Map(pageChrome.map((n) => [n.path, n]));
  const nodes: PageNodeChrome[] = expanded.nodes.map((n) => {
    const existing = chromeByPath.get(n.path);
    if (existing) return existing;
    return {
      path: n.path,
      views: n.views,
      prospects: n.views,
      dropOffs: 0,
      dropOffPct: 0,
      medianDwellMs: null,
      topDropOffSection: null,
      returnHits: 0,
      medianReturnGapMs: null,
    };
  });

  const detailPath = opts.detailPath?.trim() || null;
  let detail: NodeSidePanel | null = null;
  let convertedDetail: ConvertedSinkDetail | null = null;
  if (detailPath === CONVERTED_NODE) {
    convertedDetail = buildConvertedSinkDetail(convertedRecords);
  } else if (detailPath && detailPath !== DROP_OFF_NODE) {
    const exitSections = sectionGraph.nodes
      .filter((s) => s.path === detailPath && s.dropOffs > 0)
      .map((s) => ({ sectionId: s.sectionId, count: s.dropOffs }));
    const outbound = withReturns.edges
      .filter((e) => e.from === detailPath && e.to !== detailPath)
      .map((e) => ({ to: e.to, count: e.count }));
    detail = buildNodeSidePanel({
      path: detailPath,
      events,
      exitSections,
      pageDropOffTotal: feedMap.get(detailPath) ?? 0,
      outbound,
      visitEndedAt,
      returnTimeline: returnsForPath(returns, detailPath).map((r) => ({
        returnedAt: r.returnedAt,
        gapMs: r.gapMs,
        priorDropOffPath: r.priorDropOffPath,
      })),
    });
  }

  const countryLegend = colorByCountry
    ? buildCountryLegend(selectedCountries)
    : [];

  return {
    nodes,
    edges: expanded.edges,
    sections: sectionGraph.nodes,
    sectionEdges: sectionGraph.edges,
    expandablePaths,
    detail,
    countryLegend,
    convertedDetail,
  };
}

/** Dig-in only — same filters as the graph; does not need expandPath. */
export async function loadNodeDetailFromDb(
  db: SupabaseClient,
  opts: {
    path: string;
    from: string;
    to: string;
    entrySource?: string | null;
    visitorCohort?: VisitorCohort | null;
    countries?: string[] | null;
    includeConverted?: boolean;
  },
): Promise<{
  detail: NodeSidePanel | null;
  convertedDetail: ConvertedSinkDetail | null;
}> {
  const r = await loadPageTransitionsFromDb(db, {
    from: opts.from,
    to: opts.to,
    entrySource: opts.entrySource,
    visitorCohort: opts.visitorCohort,
    countries: opts.countries,
    includeConverted: opts.includeConverted === true || opts.path === CONVERTED_NODE,
    detailPath: opts.path,
  });
  return { detail: r.detail, convertedDetail: r.convertedDetail };
}
