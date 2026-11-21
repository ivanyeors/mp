// ponytail: longest-path ranks + one barycenter pass; upgrade to dagre if crossings get ugly.

export type LayoutEdge = { source: string; target: string };
export type LayoutPos = { x: number; y: number };

const COL_GAP = 280;
const ROW_GAP = 120;
const PAD = 40;

export function layoutRuleGraph(
  nodeIds: string[],
  edges: LayoutEdge[],
  opts?: { colGap?: number; rowGap?: number },
): Map<string, LayoutPos> {
  const colGap = opts?.colGap ?? COL_GAP;
  const rowGap = opts?.rowGap ?? ROW_GAP;
  const idSet = new Set(nodeIds);
  const outs = new Map<string, string[]>();
  const ins = new Map<string, string[]>();
  for (const id of nodeIds) {
    outs.set(id, []);
    ins.set(id, []);
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    outs.get(e.source)!.push(e.target);
    ins.get(e.target)!.push(e.source);
  }

  const rank = kahnRanks(idSet, ins, outs) ?? relaxRanks(nodeIds, edges, idSet);
  for (const id of nodeIds) if (!rank.has(id)) rank.set(id, 0);

  const maxRank = Math.max(0, ...[...rank.values()]);
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const id of nodeIds) layers[rank.get(id)!]!.push(id);

  for (const layer of layers) layer.sort();
  for (let r = 1; r < layers.length; r++) {
    const prev = layers[r - 1]!;
    const indexOf = new Map(prev.map((id, i) => [id, i]));
    layers[r]!.sort((a, b) => {
      const ba = bary(ins.get(a)!, indexOf);
      const bb = bary(ins.get(b)!, indexOf);
      return ba - bb || a.localeCompare(b);
    });
  }

  const pos = new Map<string, LayoutPos>();
  for (let r = 0; r < layers.length; r++) {
    const layer = layers[r]!;
    const height = (layer.length - 1) * rowGap;
    for (let i = 0; i < layer.length; i++) {
      pos.set(layer[i]!, {
        x: PAD + r * colGap,
        y: PAD + i * rowGap - height / 2,
      });
    }
  }

  let minY = Infinity;
  for (const p of pos.values()) minY = Math.min(minY, p.y);
  if (Number.isFinite(minY) && minY !== PAD) {
    const dy = PAD - minY;
    for (const p of pos.values()) p.y += dy;
  }

  return pos;
}

function kahnRanks(
  idSet: Set<string>,
  ins: Map<string, string[]>,
  outs: Map<string, string[]>,
): Map<string, number> | null {
  const rank = new Map<string, number>();
  const indegree = new Map<string, number>();
  const queue: string[] = [];
  for (const id of idSet) {
    const deg = ins.get(id)!.length;
    indegree.set(id, deg);
    if (deg === 0) {
      rank.set(id, 0);
      queue.push(id);
    }
  }

  let head = 0;
  let settled = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    settled++;
    const r = rank.get(id) ?? 0;
    for (const target of outs.get(id)!) {
      if ((rank.get(target) ?? 0) < r + 1) rank.set(target, r + 1);
      const left = indegree.get(target)! - 1;
      indegree.set(target, left);
      if (left === 0) queue.push(target);
    }
  }

  return settled === idSet.size ? rank : null;
}

function relaxRanks(
  nodeIds: string[],
  edges: LayoutEdge[],
  idSet: Set<string>,
): Map<string, number> {
  const rank = new Map<string, number>();
  for (const id of nodeIds) rank.set(id, 0);

  let guard = nodeIds.length * nodeIds.length + 1;
  let changed = true;
  while (changed && guard-- > 0) {
    changed = false;
    for (const e of edges) {
      if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
      const sr = rank.get(e.source) ?? 0;
      const tr = rank.get(e.target) ?? 0;
      if (tr < sr + 1) {
        rank.set(e.target, sr + 1);
        changed = true;
      }
    }
  }
  return rank;
}

function bary(parents: string[], indexOf: Map<string, number>): number {
  if (!parents.length) return 0;
  let sum = 0;
  let n = 0;
  for (const p of parents) {
    const i = indexOf.get(p);
    if (i != null) {
      sum += i;
      n++;
    }
  }
  return n ? sum / n : 0;
}
