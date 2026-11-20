import type { PageViewEvent } from "./transitions";
import type { JourneyEdge, JourneyNode } from "./transitions";

export const CONVERTED_NODE = "__converted__";

export type ConvertedVisitRow = {
  id: string;
  entry_source: string | null;
  started_at: string;
  converted_order_id: string;
};

export type ConvertedOrderRow = { paid_at: string; total: number };

export type ConvertedRecord = {
  visitId: string;
  lastPath: string;
  entrySource: string;
  journeyDurationMs: number;
  orderValue: number;
  shortPath: string[];
};

export type ConvertedFeed = { lastPath: string; count: number };

export type ConvertedSinkDetail = {
  count: number;
  totalValue: number;
  byEntrySource: { entrySource: string; count: number; totalValue: number }[];
  samples: {
    entrySource: string;
    journeyDurationMs: number;
    orderValue: number;
    shortPath: string[];
  }[];
};

export function isProspectVisit(convertedOrderId: string | null | undefined): boolean {
  return convertedOrderId == null || convertedOrderId === "";
}

export function lastPagePath(events: PageViewEvent[]): string | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!.path;
    if (p) return p;
  }
  return null;
}

export function collapsePath(events: PageViewEvent[]): string[] {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const out: string[] = [];
  for (const e of sorted) {
    if (!e.path) continue;
    if (out[out.length - 1] !== e.path) out.push(e.path);
  }
  return out;
}

export function entrySourceForConversion(visit: { entry_source: string | null }): string {
  const s = visit.entry_source?.trim();
  return s || "Direct";
}

export function buildConvertedRecords(input: {
  visits: ConvertedVisitRow[];
  orders: Map<string, ConvertedOrderRow>;
  eventsByVisit: Map<string, PageViewEvent[]>;
}): ConvertedRecord[] {
  const out: ConvertedRecord[] = [];
  for (const v of input.visits) {
    const order = input.orders.get(v.converted_order_id);
    if (!order?.paid_at) continue;
    const events = input.eventsByVisit.get(v.id) ?? [];
    const lastPath = lastPagePath(events);
    if (!lastPath) continue;
    const start = Date.parse(v.started_at);
    const paid = Date.parse(order.paid_at);
    if (!Number.isFinite(start) || !Number.isFinite(paid) || paid < start) continue;
    out.push({
      visitId: v.id,
      lastPath,
      entrySource: entrySourceForConversion(v),
      journeyDurationMs: paid - start,
      orderValue: order.total,
      shortPath: collapsePath(events),
    });
  }
  return out;
}

export function collectConvertedFeeds(records: ConvertedRecord[]): ConvertedFeed[] {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.lastPath, (map.get(r.lastPath) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([lastPath, count]) => ({ lastPath, count }))
    .sort((a, b) => b.count - a.count || a.lastPath.localeCompare(b.lastPath));
}

export function attachConvertedSink(
  graph: { nodes: JourneyNode[]; edges: JourneyEdge[] },
  feeds: ConvertedFeed[],
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
  if (!nodes.some((n) => n.path === CONVERTED_NODE)) {
    nodes.push({ path: CONVERTED_NODE, views: sinkViews });
  } else {
    nodes.find((n) => n.path === CONVERTED_NODE)!.views += sinkViews;
  }

  const edges = [...graph.edges];
  for (const [from, count] of edgeCounts) {
    const existing = edges.find((e) => e.from === from && e.to === CONVERTED_NODE);
    if (existing) existing.count += count;
    else edges.push({ from, to: CONVERTED_NODE, count });
  }

  edges.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  nodes.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));
  return { nodes, edges };
}

export function buildConvertedSinkDetail(
  records: ConvertedRecord[],
  sampleLimit = 8,
): ConvertedSinkDetail {
  const bySource = new Map<string, { count: number; totalValue: number }>();
  let totalValue = 0;
  for (const r of records) {
    totalValue += r.orderValue;
    const cur = bySource.get(r.entrySource) ?? { count: 0, totalValue: 0 };
    cur.count += 1;
    cur.totalValue += r.orderValue;
    bySource.set(r.entrySource, cur);
  }

  return {
    count: records.length,
    totalValue,
    byEntrySource: [...bySource.entries()]
      .map(([entrySource, v]) => ({ entrySource, ...v }))
      .sort((a, b) => b.count - a.count || a.entrySource.localeCompare(b.entrySource)),
    samples: records.slice(0, sampleLimit).map((r) => ({
      entrySource: r.entrySource,
      journeyDurationMs: r.journeyDurationMs,
      orderValue: r.orderValue,
      shortPath: r.shortPath,
    })),
  };
}
