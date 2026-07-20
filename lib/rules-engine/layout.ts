/**
 * Left-to-right layered layout for rule graphs (authoring canvas only).
 * ponytail: longest-path ranks + one barycenter pass; upgrade to dagre if crossings get ugly.
 */

export type LayoutEdge = { source: string; target: string };
export type LayoutPos = { x: number; y: number };

const COL_GAP = 280;
const ROW_GAP = 120;
const PAD = 40;

/** Assign neat positions for a DAG; disconnected nodes land in the leftmost column. */
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

  // Longest-path rank from roots (indegree 0).
  const rank = new Map<string, number>();
  const roots = nodeIds.filter((id) => (ins.get(id)?.length ?? 0) === 0);
  const queue = roots.length ? [...roots] : [...nodeIds];
  for (const id of queue) rank.set(id, 0);

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
  for (const id of nodeIds) if (!rank.has(id)) rank.set(id, 0);

  const maxRank = Math.max(0, ...[...rank.values()]);
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const id of nodeIds) layers[rank.get(id)!]!.push(id);

  // Stable seed order, then one barycenter pass (parents' average index).
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

  // Shift so topmost y is PAD (centers tall columns without negative coords).
  let minY = Infinity;
  for (const p of pos.values()) minY = Math.min(minY, p.y);
  if (Number.isFinite(minY) && minY !== PAD) {
    const dy = PAD - minY;
    for (const p of pos.values()) p.y += dy;
  }

  return pos;
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
