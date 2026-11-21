import type { PageViewEvent } from "./transitions";
import { CONVERTED_NODE } from "./converted-sink";
import { DROP_OFF_NODE } from "./drop-off-sink";

export type PageNodeChrome = {
  path: string;
  views: number;
  prospects: number;
  dropOffs: number;
  dropOffPct: number;
  medianDwellMs: number | null;
  topDropOffSection: string | null;
  returnHits: number;
  medianReturnGapMs: number | null;
  groupedPaths?: number;
};

export type ReturnTimelineEntry = {
  returnedAt: string;
  gapMs: number;
  priorDropOffPath: string | null;
};

export type ExitSectionRow = {
  sectionId: string;
  count: number;
  sharePct: number;
};

export type OutboundTransition = { to: string; count: number };

export type JourneyGroupDetail = {
  kind: "pages" | "sources";
  total: number;
  members: { label: string; count: number; sharePct: number }[];
};

export function buildGroupDetail(
  kind: JourneyGroupDetail["kind"],
  entries: Iterable<readonly [string, number]>,
): JourneyGroupDetail {
  const rows = [...entries].filter(([, count]) => count > 0);
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  const members = rows
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({
      label,
      count,
      sharePct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  return { kind, total, members };
}

export type JourneyRoute = { pathSeq: string[]; count: number };

export type DwellHistogramBin = {
  startMs: number;
  endMs: number | null;
  count: number;
  overflow?: boolean;
};

export type NodeSidePanel = {
  path: string;
  exitSections: ExitSectionRow[];
  dwellMsSamples: number[];
  medianDwellMs: number | null;
  routes: JourneyRoute[];
  returnTimeline: ReturnTimelineEntry[];
  outbound: OutboundTransition[];
};

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

const DWELL_BIN_MS = 10_000;
const DWELL_AXIS_CAP_MS = 600_000;

export function binDwellHistogram(samplesMs: number[]): {
  bins: DwellHistogramBin[];
  medianMs: number | null;
  meanMs: number | null;
  maxAxisMs: number;
} {
  if (samplesMs.length === 0) {
    return { bins: [], medianMs: null, meanMs: null, maxAxisMs: 0 };
  }

  const medianMs = median(samplesMs);
  const meanMs = mean(samplesMs);
  const hasOverflow = samplesMs.some((ms) => ms >= DWELL_AXIS_CAP_MS);
  const inRangeMax = samplesMs
    .filter((ms) => ms < DWELL_AXIS_CAP_MS)
    .reduce((m, ms) => Math.max(m, ms), 0);
  const maxAxisMs = hasOverflow
    ? DWELL_AXIS_CAP_MS
    : Math.ceil(inRangeMax / DWELL_BIN_MS) * DWELL_BIN_MS || DWELL_BIN_MS;

  const binCount = maxAxisMs / DWELL_BIN_MS;
  const bins: DwellHistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      startMs: i * DWELL_BIN_MS,
      endMs: (i + 1) * DWELL_BIN_MS,
      count: 0,
    });
  }
  if (hasOverflow) {
    bins.push({
      startMs: DWELL_AXIS_CAP_MS,
      endMs: null,
      count: 0,
      overflow: true,
    });
  }

  for (const ms of samplesMs) {
    if (!Number.isFinite(ms) || ms < 0) continue;
    if (ms >= DWELL_AXIS_CAP_MS) {
      bins[bins.length - 1]!.count++;
    } else {
      const idx = Math.min(
        binCount - 1,
        Math.floor(ms / DWELL_BIN_MS),
      );
      bins[idx]!.count++;
    }
  }

  return { bins, medianMs, meanMs, maxAxisMs };
}

export function edgeStrokeWidth(count: number, maxCount: number): number {
  if (count <= 0) return 1;
  if (maxCount <= 0) return 1;
  return 1 + (count / maxCount) * 7;
}

export function edgeTrafficT(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.min(1, count / maxCount);
}

export function edgeTrafficMixPct(count: number, maxCount: number): number {
  return Math.round(22 + edgeTrafficT(count, maxCount) * 78);
}

export function edgeTrafficOpacity(count: number, maxCount: number): number {
  return 0.35 + edgeTrafficT(count, maxCount) * 0.6;
}

export function collectPageDwells(
  events: PageViewEvent[],
  visitEndedAt: Map<string, string> = new Map(),
): Map<string, number[]> {
  const byVisit = new Map<string, PageViewEvent[]>();
  for (const e of events) {
    if (!e.path || e.path === DROP_OFF_NODE || e.path === CONVERTED_NODE) continue;
    const list = byVisit.get(e.visitId) ?? [];
    list.push(e);
    byVisit.set(e.visitId, list);
  }

  const dwells = new Map<string, number[]>();
  for (const [visitId, list] of byVisit) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    let i = 0;
    while (i < list.length) {
      const cur = list[i]!;
      let j = i + 1;
      while (j < list.length && list[j]!.path === cur.path) j++;
      const start = Date.parse(cur.occurredAt);
      const next = list[j];
      const end = next
        ? Date.parse(next.occurredAt)
        : Date.parse(visitEndedAt.get(visitId) ?? cur.occurredAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        const arr = dwells.get(cur.path) ?? [];
        arr.push(end - start);
        dwells.set(cur.path, arr);
      }
      i = j;
    }
  }
  return dwells;
}

export function buildNodeChrome(input: {
  nodes: { path: string; views: number }[];
  events: PageViewEvent[];
  dropOffsByPath: Map<string, number>;
  topSectionByPath: Map<string, string>;
  visitEndedAt?: Map<string, string>;
  returnHitsByPath?: Map<string, { returnHits: number; medianReturnGapMs: number | null }>;
}): PageNodeChrome[] {
  const prospectsByPath = new Map<string, Set<string>>();
  for (const e of input.events) {
    if (!e.path || e.path === DROP_OFF_NODE || e.path === CONVERTED_NODE) continue;
    const set = prospectsByPath.get(e.path) ?? new Set();
    set.add(e.visitId);
    prospectsByPath.set(e.path, set);
  }

  const dwells = collectPageDwells(input.events, input.visitEndedAt ?? new Map());
  const returns = input.returnHitsByPath ?? new Map();

  return input.nodes.map((n) => {
    if (n.path === DROP_OFF_NODE) {
      return {
        path: n.path,
        views: n.views,
        prospects: n.views,
        dropOffs: n.views,
        dropOffPct: 100,
        medianDwellMs: null,
        topDropOffSection: null,
        returnHits: 0,
        medianReturnGapMs: null,
      };
    }
    if (n.path === CONVERTED_NODE) {
      return {
        path: n.path,
        views: n.views,
        prospects: 0,
        dropOffs: 0,
        dropOffPct: 0,
        medianDwellMs: null,
        topDropOffSection: null,
        returnHits: null,
        medianReturnGapMs: null,
      };
    }
    const prospects = prospectsByPath.get(n.path)?.size ?? 0;
    const dropOffs = input.dropOffsByPath.get(n.path) ?? 0;
    const dropOffPct = prospects > 0 ? Math.round((dropOffs / prospects) * 1000) / 10 : 0;
    const ret = returns.get(n.path);
    return {
      path: n.path,
      views: n.views,
      prospects,
      dropOffs,
      dropOffPct,
      medianDwellMs: median(dwells.get(n.path) ?? []),
      topDropOffSection: input.topSectionByPath.get(n.path) ?? null,
      returnHits: ret?.returnHits ?? 0,
      medianReturnGapMs: ret?.medianReturnGapMs ?? null,
    };
  });
}

export function buildNodeSidePanel(input: {
  path: string;
  events: PageViewEvent[];
  exitSections: { sectionId: string; count: number }[];
  pageDropOffTotal?: number;
  outbound?: OutboundTransition[];
  visitEndedAt?: Map<string, string>;
  routeLimit?: number;
  outboundLimit?: number;
  returnTimeline?: ReturnTimelineEntry[];
}): NodeSidePanel {
  const dwells = collectPageDwells(input.events, input.visitEndedAt ?? new Map());
  const dwellMsSamples = dwells.get(input.path) ?? [];

  const byVisit = new Map<string, string[]>();
  for (const e of input.events) {
    if (!e.path || e.path === DROP_OFF_NODE || e.path === CONVERTED_NODE) continue;
    const list = byVisit.get(e.visitId) ?? [];
    if (list[list.length - 1] !== e.path) list.push(e.path);
    byVisit.set(e.visitId, list);
  }

  const routeCounts = new Map<string, { pathSeq: string[]; count: number }>();
  for (const pathSeq of byVisit.values()) {
    if (!pathSeq.includes(input.path)) continue;
    const key = pathSeq.join("\0");
    const row = routeCounts.get(key);
    if (row) row.count++;
    else routeCounts.set(key, { pathSeq, count: 1 });
  }
  const routes = [...routeCounts.values()]
    .sort(
      (a, b) =>
        b.count - a.count || a.pathSeq.join("\0").localeCompare(b.pathSeq.join("\0")),
    )
    .slice(0, input.routeLimit ?? 10);

  const dropTotal =
    input.pageDropOffTotal ??
    input.exitSections.reduce((s, e) => s + e.count, 0);
  const exitSections: ExitSectionRow[] = [...input.exitSections]
    .sort((a, b) => b.count - a.count || a.sectionId.localeCompare(b.sectionId))
    .map((s) => ({
      sectionId: s.sectionId,
      count: s.count,
      sharePct:
        dropTotal > 0 ? Math.round((s.count / dropTotal) * 1000) / 10 : 0,
    }));

  const outbound = [...(input.outbound ?? [])]
    .sort((a, b) => b.count - a.count || a.to.localeCompare(b.to))
    .slice(0, input.outboundLimit ?? 5);

  return {
    path: input.path,
    exitSections,
    dwellMsSamples,
    medianDwellMs: median(dwellMsSamples),
    routes,
    returnTimeline: [...(input.returnTimeline ?? [])].sort((a, b) =>
      b.returnedAt.localeCompare(a.returnedAt),
    ),
    outbound,
  };
}
