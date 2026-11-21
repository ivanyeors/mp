import { CONVERTED_NODE } from "./converted-sink";
import { isDivePort } from "./dive";
import { DROP_OFF_NODE } from "./drop-off-sink";
import { isSectionChildPath } from "./paths";

type LayoutIn = { path: string; views: number };
type LayoutEdge = { from: string; to: string; dashed?: boolean };

const COL_GAP = 220;
const ROW_GAP = 120;

function pageRanks(
  pages: string[],
  edges: LayoutEdge[],
): Map<string, number> {
  const pageSet = new Set(pages);
  const preds = new Map<string, string[]>();
  for (const p of pages) preds.set(p, []);
  for (const e of edges) {
    if (e.dashed) continue;
    if (!pageSet.has(e.from) || !pageSet.has(e.to) || e.from === e.to) continue;
    preds.get(e.to)!.push(e.from);
  }

  const memo = new Map<string, number>();
  const stack = new Set<string>();
  function depth(p: string): number {
    const hit = memo.get(p);
    if (hit !== undefined) return hit;
    if (stack.has(p)) return 0;
    stack.add(p);
    const ps = preds.get(p) ?? [];
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(depth)) + 1;
    stack.delete(p);
    memo.set(p, d);
    return d;
  }
  for (const p of pages) depth(p);
  return memo;
}

export function layoutJourneyGraph<T extends LayoutIn>(
  nodes: T[],
  edges: LayoutEdge[],
  width: number,
  height: number,
): (T & { x: number; y: number })[] {
  const dropOffSink = nodes.find((n) => n.path === DROP_OFF_NODE);
  const convertedSink = nodes.find((n) => n.path === CONVERTED_NODE);
  const pages = nodes.filter(
    (n) =>
      n.path !== DROP_OFF_NODE &&
      n.path !== CONVERTED_NODE &&
      !isSectionChildPath(n.path) &&
      !isDivePort(n.path),
  );

  const ranks = pageRanks(
    pages.map((p) => p.path),
    edges,
  );
  const byRank = new Map<number, T[]>();
  for (const n of pages) {
    const r = ranks.get(n.path) ?? 0;
    const col = byRank.get(r) ?? [];
    col.push(n);
    byRank.set(r, col);
  }
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of rankKeys) {
    byRank.get(r)!.sort(
      (a, b) => b.views - a.views || a.path.localeCompare(b.path),
    );
  }

  const nCols = Math.max(1, rankKeys.length) + (dropOffSink || convertedSink ? 1 : 0);
  const gridW = (nCols - 1) * COL_GAP;
  const x0 = width / 2 - gridW / 2;

  const laid: (T & { x: number; y: number })[] = [];
  rankKeys.forEach((r, ci) => {
    const col = byRank.get(r)!;
    const colH = (col.length - 1) * ROW_GAP;
    const top = height / 2 - colH / 2;
    col.forEach((n, ri) => {
      laid.push({ ...n, x: x0 + ci * COL_GAP, y: top + ri * ROW_GAP });
    });
  });

  const sinkX = x0 + (nCols - 1) * COL_GAP;
  const cy = height / 2;
  if (dropOffSink && convertedSink) {
    laid.push({ ...dropOffSink, x: sinkX, y: cy - ROW_GAP / 2 });
    laid.push({ ...convertedSink, x: sinkX, y: cy + ROW_GAP / 2 });
  } else if (dropOffSink) {
    laid.push({ ...dropOffSink, x: sinkX, y: cy });
  } else if (convertedSink) {
    laid.push({ ...convertedSink, x: sinkX, y: cy });
  }
  return laid;
}
