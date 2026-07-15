import type { PageViewEvent } from "./transitions";
import { DROP_OFF_NODE } from "./drop-off-sink";

/** Page node chrome for the unique-node journey graph. */
export type PageNodeChrome = {
  path: string;
  views: number;
  prospects: number;
  dropOffs: number;
  /** 0–100; dropOffs / prospects. */
  dropOffPct: number;
  medianDwellMs: number | null;
  topDropOffSection: string | null;
  /** Landings of return Visits after a prior Drop-off. */
  returnHits: number;
  medianReturnGapMs: number | null;
};

export type ReturnTimelineEntry = {
  returnedAt: string;
  gapMs: number;
  priorDropOffPath: string | null;
};

export type NodeSidePanel = {
  path: string;
  exitSections: { sectionId: string; count: number }[];
  dwellMsSamples: number[];
  medianDwellMs: number | null;
  /** Sample Visit page sequences that touch this node (unique-node loops reuse paths). */
  samplePaths: string[][];
  returnTimeline: ReturnTimelineEntry[];
};

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Edge thickness ∝ transition count (1–8px). */
export function edgeStrokeWidth(count: number, maxCount: number): number {
  if (count <= 0) return 1;
  if (maxCount <= 0) return 1;
  return 1 + (count / maxCount) * 7;
}

/**
 * Per-page dwell samples: time from landing on a path until the next different
 * page_view in the same Visit (or until visit end when last page).
 */
export function collectPageDwells(
  events: PageViewEvent[],
  visitEndedAt: Map<string, string> = new Map(),
): Map<string, number[]> {
  const byVisit = new Map<string, PageViewEvent[]>();
  for (const e of events) {
    if (!e.path || e.path === DROP_OFF_NODE) continue;
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
      while (j < list.length && list[j]!.path === cur.path) j++; // collapse refreshes
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
    if (!e.path || e.path === DROP_OFF_NODE) continue;
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
  visitEndedAt?: Map<string, string>;
  sampleLimit?: number;
  returnTimeline?: ReturnTimelineEntry[];
}): NodeSidePanel {
  const dwells = collectPageDwells(input.events, input.visitEndedAt ?? new Map());
  const dwellMsSamples = dwells.get(input.path) ?? [];

  const byVisit = new Map<string, string[]>();
  for (const e of input.events) {
    if (!e.path || e.path === DROP_OFF_NODE) continue;
    const list = byVisit.get(e.visitId) ?? [];
    // Unique-node: consecutive same-path refresh collapses in path sample.
    if (list[list.length - 1] !== e.path) list.push(e.path);
    byVisit.set(e.visitId, list);
  }

  const samplePaths: string[][] = [];
  for (const pathSeq of byVisit.values()) {
    if (!pathSeq.includes(input.path)) continue;
    samplePaths.push(pathSeq);
    if (samplePaths.length >= (input.sampleLimit ?? 5)) break;
  }

  return {
    path: input.path,
    exitSections: [...input.exitSections].sort(
      (a, b) => b.count - a.count || a.sectionId.localeCompare(b.sectionId),
    ),
    dwellMsSamples,
    medianDwellMs: median(dwellMsSamples),
    samplePaths,
    returnTimeline: [...(input.returnTimeline ?? [])].sort((a, b) =>
      b.returnedAt.localeCompare(a.returnedAt),
    ),
  };
}
