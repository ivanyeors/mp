import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGroupDetail,
  buildNodeChrome,
  buildNodeSidePanel,
  type JourneyGroupDetail,
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
import {
  attachEntrySources,
  DEFAULT_ENTRY_TOP_N,
  entryNodePath,
  entrySourceOf,
  isEntryNode,
  normalizeEntrySource,
  OTHER_ENTRY,
  rankEntrySources,
  type EntryFeed,
} from "./entry-nodes";
import { attachDropOffSink, DROP_OFF_NODE } from "./drop-off-sink";
import { collapseJourneyPath, isGroupedPath } from "./path-groups";
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

type Rows<T> = { data: T[] | null; error: { message: string } | null };
type Pageable<T> = { range(from: number, to: number): PromiseLike<Rows<T>> };

function rowsOrThrow<T>({ data, error }: Rows<T>): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}

const PAGE_ROWS = 1000;

async function selectAll<T>(query: () => Pageable<T>, maxRows = Infinity): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = rowsOrThrow(await query().range(rows.length, rows.length + PAGE_ROWS - 1));
    rows.push(...page);
    if (page.length < PAGE_ROWS || rows.length > maxRows) return rows;
  }
}

const IN_CHUNK = 100;
const IN_CHUNKS_IN_FLIGHT = 4;

type InQuery<T> = Pageable<T> & {
  limit(count: number): PromiseLike<Rows<T>>;
  order(column: string): InQuery<T>;
};

async function selectIn<T>(ids: string[], query: (ids: string[]) => InQuery<T>): Promise<T[]> {
  const rows = rowsOrThrow(await query(ids).limit(PAGE_ROWS));
  if (rows.length < PAGE_ROWS) return rows;
  if (ids.length === 1) return selectAll(() => query(ids).order("id"));
  const mid = Math.ceil(ids.length / 2);
  const first = await selectIn(ids.slice(0, mid), query);
  return [...first, ...(await selectIn(ids.slice(mid), query))];
}

async function selectAllIn<T>(
  ids: string[],
  query: (ids: string[]) => InQuery<T>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    chunks.push(ids.slice(i, i + IN_CHUNK));
  }
  const results: T[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await selectIn(chunks[i]!, query);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(IN_CHUNKS_IN_FLIGHT, chunks.length) }, worker),
  );
  return results.flat();
}

function byOccurredAt(
  a: { occurred_at: string; visit_id: string },
  b: { occurred_at: string; visit_id: string },
): number {
  return a.occurred_at.localeCompare(b.occurred_at) || a.visit_id.localeCompare(b.visit_id);
}

const MAX_RANGE_VISITS = 20_000;

export async function listJourneyFacetsFromDb(
  db: SupabaseClient,
): Promise<{ entrySources: string[]; countries: string[] }> {
  const rows = await selectAll<{ entry_source: string | null; country: string | null }>(
    () => db.from("analytics_visits").select("entry_source, country").order("id"),
  );
  const sources = new Set<string>();
  const countries = new Set<string>();
  for (const row of rows) {
    if (row.entry_source) sources.add(row.entry_source);
    const c = row.country?.trim();
    countries.add(c && c.length > 0 ? c : UNKNOWN_COUNTRY);
  }
  return {
    entrySources: [...sources].sort((a, b) => a.localeCompare(b)),
    countries: [...countries].sort((a, b) => {
      if (a === UNKNOWN_COUNTRY) return 1;
      if (b === UNKNOWN_COUNTRY) return -1;
      return a.localeCompare(b);
    }),
  };
}

export async function listEntrySourcesFromDb(db: SupabaseClient): Promise<string[]> {
  return (await listJourneyFacetsFromDb(db)).entrySources;
}

export async function listCountriesFromDb(db: SupabaseClient): Promise<string[]> {
  return (await listJourneyFacetsFromDb(db)).countries;
}

type VisitRow = {
  id: string;
  visitor_id: string;
  started_at: string;
  ended_at: string | null;
  drop_off_path: string | null;
  drop_off_section: string | null;
  entry_source: string | null;
  country: string | null;
  converted_order_id: string | null;
};
type HistoryRow = Pick<
  VisitRow,
  "id" | "visitor_id" | "started_at" | "ended_at" | "drop_off_path" | "country"
>;
type PageViewRow = { visit_id: string; path: string; occurred_at: string };
type SectionViewRow = PageViewRow & { section_id: string | null };
type OrderRow = { id: string; paid_at: string | null; total: number | string };

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

function buildSectionGraph(
  sectionViews: SectionViewRow[],
  focusVisits: VisitRow[],
  groupPath: (path: string) => string,
): { nodes: SectionNode[]; edges: SectionEdge[] } {
  const dropCounts = new Map<string, number>();
  for (const v of focusVisits) {
    if (v.drop_off_path == null || v.drop_off_section == null || v.ended_at == null) {
      continue;
    }
    const path = groupPath(v.drop_off_path);
    const sectionId = v.drop_off_section;
    if (!path || !sectionId) continue;
    const k = `${path}\0${sectionId}`;
    dropCounts.set(k, (dropCounts.get(k) ?? 0) + 1);
  }

  return buildSectionTransitions(
    sectionViews
      .filter((row) => row.section_id)
      .map((row) => ({
        visitId: row.visit_id,
        path: groupPath(row.path),
        sectionId: row.section_id!,
        occurredAt: row.occurred_at,
      })),
    [...dropCounts.entries()].map(([key, count]) => {
      const [path, sectionId] = key.split("\0");
      return { path: path!, sectionId: sectionId!, count };
    }),
  );
}

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

function buildConvertedFromRows(
  convertedVisits: ConvertedVisitRow[],
  rows: { orders: OrderRow[]; pageViews: PageViewRow[] },
  groupPath: (path: string) => string,
): ReturnType<typeof buildConvertedRecords> {
  if (convertedVisits.length === 0) return [];

  const orderMap = new Map<string, { paid_at: string; total: number }>();
  for (const row of rows.orders) {
    if (row.id && row.paid_at != null) {
      orderMap.set(row.id, { paid_at: row.paid_at, total: Number(row.total) });
    }
  }

  const eventsByVisit = new Map<string, PageViewEvent[]>();
  for (const row of rows.pageViews) {
    const list = eventsByVisit.get(row.visit_id) ?? [];
    list.push({
      visitId: row.visit_id,
      path: groupPath(row.path),
      occurredAt: row.occurred_at,
    });
    eventsByVisit.set(row.visit_id, list);
  }

  return buildConvertedRecords({
    visits: convertedVisits,
    orders: orderMap,
    eventsByVisit,
  });
}

type JourneyRows = {
  visits: VisitRow[];
  history: HistoryRow[];
  pageViews: PageViewRow[];
  sectionViews: SectionViewRow[];
  converted: () => Promise<{ orders: OrderRow[]; pageViews: PageViewRow[] }>;
};

type JourneyFilters = {
  from: string;
  to: string;
  entrySource?: string | null;
  countries?: string[] | null;
};

function selectedCountriesOf(countries: string[] | null | undefined): string[] {
  return [...new Set((countries ?? []).map((c) => c.trim()).filter(Boolean))];
}

async function fetchJourneyRows(
  db: SupabaseClient,
  opts: JourneyFilters,
): Promise<JourneyRows> {
  const range = () => {
    let q = db
      .from("analytics_visits")
      .select(
        "id, visitor_id, started_at, ended_at, drop_off_path, drop_off_section, entry_source, country, converted_order_id",
      )
      .gte("started_at", opts.from)
      .lte("started_at", opts.to);
    if (opts.entrySource) q = q.eq("entry_source", opts.entrySource);
    return q.order("started_at").order("id");
  };
  let visits = await selectAll<VisitRow>(range, MAX_RANGE_VISITS);
  if (visits.length > MAX_RANGE_VISITS) {
    throw new Error(
      `More than ${MAX_RANGE_VISITS.toLocaleString("en")} Visits in this range — pick a shorter date range.`,
    );
  }

  const selectedCountries = selectedCountriesOf(opts.countries);
  if (selectedCountries.length > 0) {
    const want = new Set(selectedCountries);
    visits = visits.filter((row) => {
      const raw = row.country?.trim();
      const c = raw && raw.length > 0 ? raw : UNKNOWN_COUNTRY;
      return want.has(c);
    });
  }

  const prospects = visits.filter((v) => isProspectVisit(v.converted_order_id));
  const prospectIds = prospects.map((v) => v.id);
  let history: HistoryRow[] = [];
  let pageViews: PageViewRow[] = [];
  let sectionViews: SectionViewRow[] = [];
  if (prospects.length > 0) {
    [history, pageViews, sectionViews] = await Promise.all([
      selectAllIn<HistoryRow>([...new Set(prospects.map((v) => v.visitor_id))], (ids) =>
        db
          .from("analytics_visits")
          .select("id, visitor_id, started_at, ended_at, drop_off_path, country")
          .in("visitor_id", ids)
          .order("started_at"),
      ),
      selectAllIn<PageViewRow>(prospectIds, (ids) =>
        db
          .from("analytics_events")
          .select("visit_id, path, occurred_at")
          .eq("type", "page_view")
          .gte("occurred_at", opts.from)
          .lte("occurred_at", opts.to)
          .in("visit_id", ids)
          .order("occurred_at"),
      ),
      selectAllIn<SectionViewRow>(prospectIds, (ids) =>
        db
          .from("analytics_events")
          .select("visit_id, path, section_id, occurred_at")
          .eq("type", "section_view")
          .gte("occurred_at", opts.from)
          .lte("occurred_at", opts.to)
          .in("visit_id", ids)
          .order("occurred_at"),
      ),
    ]);
    pageViews.sort(byOccurredAt);
    sectionViews.sort(byOccurredAt);
  }

  const convertedVisits = visits.filter((v) => !isProspectVisit(v.converted_order_id));
  let converted: ReturnType<JourneyRows["converted"]> | null = null;
  return {
    visits,
    history,
    pageViews,
    sectionViews,
    converted: () => (converted ??= fetchConvertedRows(db, convertedVisits)),
  };
}

async function fetchConvertedRows(
  db: SupabaseClient,
  visits: VisitRow[],
): Promise<{ orders: OrderRow[]; pageViews: PageViewRow[] }> {
  if (visits.length === 0) return { orders: [], pageViews: [] };
  const [orders, pageViews] = await Promise.all([
    selectAllIn<OrderRow>(
      [...new Set(visits.map((v) => v.converted_order_id as string))],
      (ids) =>
        db
          .from("orders")
          .select("id, paid_at, total")
          .in("id", ids)
          .not("paid_at", "is", null),
    ),
    selectAllIn<PageViewRow>(
      visits.map((v) => v.id),
      (ids) =>
        db
          .from("analytics_events")
          .select("visit_id, path, occurred_at")
          .eq("type", "page_view")
          .in("visit_id", ids)
          .order("occurred_at"),
    ),
  ]);
  return { orders, pageViews };
}

type JourneyGraph = {
  nodes: PageNodeChrome[];
  edges: JourneyEdge[];
  sections: SectionNode[];
  sectionEdges: SectionEdge[];
  expandablePaths: string[];
  detail: NodeSidePanel | null;
  groupDetail: JourneyGroupDetail | null;
  countryLegend: { code: string; color: string }[];
  convertedDetail: ConvertedSinkDetail | null;
};

const emptyGraph: JourneyGraph = {
  nodes: [],
  edges: [],
  sections: [],
  sectionEdges: [],
  expandablePaths: [],
  detail: null,
  groupDetail: null,
  countryLegend: [],
  convertedDetail: null,
};

type JourneyOptions = JourneyFilters & {
  visitorCohort?: VisitorCohort | null;
  includeConverted?: boolean;
  expandPath?: string | null;
  entryNodes?: boolean;
  entryTopN?: number;
  groupPaths?: boolean;
  detailPath?: string | null;
};

async function buildJourney(rows: JourneyRows, opts: JourneyOptions): Promise<JourneyGraph> {
  const groupPath =
    opts.groupPaths === false
      ? (path: string) => path
      : collapseJourneyPath;
  const selectedCountries = selectedCountriesOf(opts.countries);
  const colorByCountry = selectedCountries.length >= 2;

  const rangeRaw = rows.visits;
  const convertedVisits: ConvertedVisitRow[] = rangeRaw
    .filter((v) => !isProspectVisit(v.converted_order_id))
    .map((v) => ({
      id: v.id,
      entry_source: v.entry_source,
      started_at: v.started_at,
      converted_order_id: v.converted_order_id as string,
    }));

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
    allVisits = rows.history.map(rowToVisitMeta);

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

  const visitById = new Map(rangeRaw.map((v) => [v.id, v]));
  const focusVisits = visitIds.map((id) => visitById.get(id)!);

  let events: PageViewEvent[] = [];
  const groupedPaths = new Map<string, Map<string, number>>();
  if (visitIds.length > 0) {
    const data = rows.pageViews.filter((row) => focusVisitIds.has(row.visit_id));

    for (const row of data) {
      const raw = row.path;
      const grouped = groupPath(raw);
      if (grouped === raw) continue;
      const seen = groupedPaths.get(grouped) ?? new Map<string, number>();
      seen.set(raw, (seen.get(raw) ?? 0) + 1);
      groupedPaths.set(grouped, seen);
    }
    events = data.map((row) => {
      const visitId = row.visit_id;
      return {
        visitId,
        path: groupPath(row.path),
        occurredAt: row.occurred_at,
        ...(colorByCountry
          ? { country: countryByVisitId.get(visitId) ?? UNKNOWN_COUNTRY }
          : {}),
      };
    });
  }
  const graph = buildPageTransitions(events);

  const feedMap = new Map<string, number>();
  const topSectionCount = new Map<string, Map<string, number>>();
  const visitEndedAt = new Map<string, string>();
  const feeds: { lastPath: string; count: number; country?: string }[] = [];
  for (const v of focusVisits) {
    if (v.ended_at) visitEndedAt.set(v.id, v.ended_at);
    if (!v.drop_off_path || !v.ended_at) continue;
    const p = groupPath(v.drop_off_path);
    feedMap.set(p, (feedMap.get(p) ?? 0) + 1);
    const section = v.drop_off_section;
    if (section) {
      const inner = topSectionCount.get(p) ?? new Map();
      inner.set(section, (inner.get(section) ?? 0) + 1);
      topSectionCount.set(p, inner);
    }
    const raw = v.country?.trim();
    const country = raw && raw.length > 0 ? raw : UNKNOWN_COUNTRY;
    if (colorByCountry) feeds.push({ lastPath: p, count: 1, country });
  }
  if (!colorByCountry) {
    for (const [lastPath, count] of feedMap) feeds.push({ lastPath, count });
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
    convertedRecords = buildConvertedFromRows(
      convertedVisits,
      await rows.converted(),
      groupPath,
    );
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

  const sectionGraph = buildSectionGraph(
    rows.sectionViews.filter((row) => focusVisitIds.has(row.visit_id)),
    focusVisits,
    groupPath,
  );
  const expandablePaths = [
    ...new Set(sectionGraph.nodes.map((n) => n.path)),
  ].sort((a, b) => a.localeCompare(b));

  const entrySourceByVisit = new Map(
    rangeRaw.map((v) => [v.id, v.entry_source] as const),
  );
  const entryFeeds: EntryFeed[] = [...landings].map(([visitId, landingPath]) => ({
    entrySource: entrySourceByVisit.get(visitId) ?? null,
    landingPath,
    count: 1,
    ...(colorByCountry
      ? { country: countryByVisitId.get(visitId) ?? UNKNOWN_COUNTRY }
      : {}),
  }));

  const graphPaths = new Set(withReturns.nodes.map((n) => n.path));
  const validEntryFeeds = entryFeeds.filter((f) => graphPaths.has(f.landingPath));
  const entryTopN = opts.entryTopN ?? DEFAULT_ENTRY_TOP_N;
  const entryRank = rankEntrySources(validEntryFeeds, entryTopN);
  if (entryRank.rolled.length > 0) {
    groupedPaths.set(
      entryNodePath(OTHER_ENTRY),
      new Map(entryRank.rolled.map((src) => [src, entryRank.totals.get(src) ?? 0])),
    );
  }

  const expandPath = opts.expandPath?.trim() || null;
  const expanded =
    expandPath && expandablePaths.includes(expandPath)
      ?
        expandPageToSections(withReturns, sectionGraph, expandPath)
      : opts.entryNodes === false
        ? withReturns
        : attachEntrySources(withReturns, validEntryFeeds, { topN: entryTopN });

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
    const groupSize = groupedPaths.get(n.path)?.size;
    const existing = chromeByPath.get(n.path);
    if (existing) {
      return groupSize ? { ...existing, groupedPaths: groupSize } : existing;
    }
    return {
      ...(groupSize ? { groupedPaths: groupSize } : {}),
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
  let groupDetail: JourneyGroupDetail | null = null;
  if (detailPath && isEntryNode(detailPath)) {
    const source = entrySourceOf(detailPath);
    if (source === OTHER_ENTRY) {
      groupDetail = buildGroupDetail(
        "sources",
        entryRank.rolled.map(
          (src) => [src, entryRank.totals.get(src) ?? 0] as const,
        ),
      );
    } else if (source) {
      const landingCounts = new Map<string, number>();
      for (const f of validEntryFeeds) {
        if (normalizeEntrySource(f.entrySource) !== source) continue;
        landingCounts.set(
          f.landingPath,
          (landingCounts.get(f.landingPath) ?? 0) + f.count,
        );
      }
      groupDetail = buildGroupDetail("pages", landingCounts);
    }
  } else if (detailPath && isGroupedPath(detailPath)) {
    groupDetail = buildGroupDetail("pages", groupedPaths.get(detailPath) ?? []);
  }

  if (detailPath === CONVERTED_NODE) {
    convertedDetail = buildConvertedSinkDetail(convertedRecords);
  } else if (
    detailPath &&
    detailPath !== DROP_OFF_NODE &&
    !isEntryNode(detailPath)
  ) {
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
    groupDetail,
    countryLegend,
    convertedDetail,
  };
}

export async function loadPageTransitionsFromDb(
  db: SupabaseClient,
  opts: JourneyOptions,
): Promise<JourneyGraph> {
  return buildJourney(await fetchJourneyRows(db, opts), opts);
}

type NodeDetailOptions = JourneyFilters & {
  visitorCohort?: VisitorCohort | null;
  includeConverted?: boolean;
  groupPaths?: boolean;
  entryTopN?: number;
};

type NodeDetail = Pick<JourneyGraph, "detail" | "groupDetail" | "convertedDetail">;

export async function loadNodeDetailsFromDb(
  db: SupabaseClient,
  opts: NodeDetailOptions & { paths: string[] },
): Promise<(NodeDetail & { path: string })[]> {
  if (opts.paths.length === 0) return [];
  const rows = await fetchJourneyRows(db, opts);
  const out: (NodeDetail & { path: string })[] = [];
  for (const path of opts.paths) {
    const r = await buildJourney(rows, {
      from: opts.from,
      to: opts.to,
      entrySource: opts.entrySource,
      visitorCohort: opts.visitorCohort,
      countries: opts.countries,
      includeConverted: opts.includeConverted === true || path === CONVERTED_NODE,
      groupPaths: opts.groupPaths !== false,
      entryTopN: opts.entryTopN,
      entryNodes: false,
      detailPath: path,
    });
    out.push({
      path,
      detail: r.detail,
      groupDetail: r.groupDetail,
      convertedDetail: r.convertedDetail,
    });
  }
  return out;
}

export async function loadNodeDetailFromDb(
  db: SupabaseClient,
  opts: NodeDetailOptions & { path: string },
): Promise<NodeDetail> {
  const [r] = await loadNodeDetailsFromDb(db, { ...opts, paths: [opts.path] });
  return { detail: r!.detail, groupDetail: r!.groupDetail, convertedDetail: r!.convertedDetail };
}
