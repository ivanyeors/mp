import { describe, expect, it } from "vitest";

import { layoutRuleGraph, type LayoutEdge, type LayoutPos } from "@/lib/rules-engine/layout";

const COL_GAP = 280;
const ROW_GAP = 120;
const PAD = 40;

function layoutRuleGraphReference(
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

type Case = {
  name: string;
  ids: string[];
  edges: LayoutEdge[];
  opts?: { colGap?: number; rowGap?: number };
};

const CASES: Case[] = [
  { name: "empty graph", ids: [], edges: [] },
  { name: "single orphan", ids: ["solo"], edges: [] },
  { name: "orphans only", ids: ["a", "b", "c"], edges: [] },
  {
    name: "linear chain",
    ids: ["in", "rng", "sz", "tpl"],
    edges: [
      { source: "in", target: "rng" },
      { source: "rng", target: "sz" },
      { source: "sz", target: "tpl" },
    ],
  },
  {
    name: "diamond",
    ids: ["a", "b", "c", "d"],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ],
  },
  {
    name: "diamond with a long side (longest path wins)",
    ids: ["a", "b", "b2", "c", "d"],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "b2" },
      { source: "b2", target: "d" },
      { source: "a", target: "c" },
      { source: "c", target: "d" },
    ],
  },
  {
    name: "flow graph plus a disconnected node",
    ids: ["in", "rng", "sz", "tpl", "fb", "loose"],
    edges: [
      { source: "in", target: "rng" },
      { source: "rng", target: "sz" },
      { source: "sz", target: "tpl" },
      { source: "in", target: "fb" },
    ],
  },
  {
    name: "dangling edges are ignored",
    ids: ["a", "b"],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "ghost" },
      { source: "ghost", target: "b" },
      { source: "ghost", target: "phantom" },
    ],
  },
  {
    name: "duplicate edges",
    ids: ["a", "b", "c"],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ],
  },
  {
    name: "multiple sources converging",
    ids: ["s1", "s2", "s3", "join", "out"],
    edges: [
      { source: "s1", target: "join" },
      { source: "s2", target: "join" },
      { source: "s3", target: "join" },
      { source: "join", target: "out" },
    ],
  },
  {
    name: "three-node cycle (no source at all)",
    ids: ["a", "b", "c"],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ],
  },
  {
    name: "cycle with a feeder and a tail",
    ids: ["feed", "a", "b", "c", "tail"],
    edges: [
      { source: "feed", target: "a" },
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
      { source: "c", target: "tail" },
    ],
  },
  {
    name: "self loop",
    ids: ["a", "b"],
    edges: [
      { source: "a", target: "a" },
      { source: "a", target: "b" },
    ],
  },
  {
    name: "two independent components, one cyclic",
    ids: ["x", "y", "p", "q"],
    edges: [
      { source: "x", target: "y" },
      { source: "p", target: "q" },
      { source: "q", target: "p" },
    ],
  },
  {
    name: "custom gaps",
    ids: ["a", "b", "c"],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ],
    opts: { colGap: 40, rowGap: 12 },
  },
];

describe("layoutRuleGraph ranks match the reference relaxation", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const actual = layoutRuleGraph(c.ids, c.edges, c.opts);
      const expected = layoutRuleGraphReference(c.ids, c.edges, c.opts);
      expect([...actual.entries()]).toEqual([...expected.entries()]);
    });
  }
});

describe("layoutRuleGraph matches the reference on random graphs", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  it("agrees over 300 random graphs (cycles included)", () => {
    const next = rng(20260902);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(next() * 9);
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      const edges: LayoutEdge[] = [];
      const m = Math.floor(next() * (n * 2));
      for (let k = 0; k < m; k++) {
        const a = Math.floor(next() * n);
        const b = Math.floor(next() * n);
        edges.push({
          source: next() < 0.1 ? "ghost" : ids[a]!,
          target: next() < 0.1 ? "ghost" : ids[b]!,
        });
      }
      const actual = layoutRuleGraph(ids, edges);
      const expected = layoutRuleGraphReference(ids, edges);
      expect([...actual.entries()], `seeded case ${t}: ${JSON.stringify(edges)}`).toEqual([
        ...expected.entries(),
      ]);
    }
  });
});

describe("layoutRuleGraph invariants", () => {
  it("keeps every DAG edge strictly left-to-right", () => {
    const ids = ["in", "rng", "sz", "tpl", "fb"];
    const edges: LayoutEdge[] = [
      { source: "in", target: "rng" },
      { source: "rng", target: "sz" },
      { source: "sz", target: "tpl" },
      { source: "in", target: "fb" },
    ];
    const pos = layoutRuleGraph(ids, edges);
    expect(pos.size).toBe(ids.length);
    for (const e of edges) {
      expect(pos.get(e.target)!.x).toBeGreaterThan(pos.get(e.source)!.x);
    }
  });

  it("gives every node a unique slot", () => {
    const ids = ["a", "b", "c", "d"];
    const pos = layoutRuleGraph(ids, [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ]);
    const slots = new Set([...pos.values()].map((p) => `${p.x},${p.y}`));
    expect(slots.size).toBe(ids.length);
  });

  it("stays linear on a wide DAG the old n² guard would have laboured over", () => {
    const ids = Array.from({ length: 600 }, (_, i) => `n${i}`);
    const edges: LayoutEdge[] = ids.slice(1).map((id, i) => ({ source: ids[i]!, target: id }));
    const pos = layoutRuleGraph(ids, edges);
    expect(pos.size).toBe(ids.length);
    expect(pos.get("n599")!.x).toBe(PAD + 599 * COL_GAP);
  });
});
