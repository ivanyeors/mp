import { catalogDef, catalogKeys } from "./catalog";
import type {
  RangeBand,
  RangeNode,
  RuleFlow,
  RuleGraphJson,
  RuleNode,
  SizeOrLength,
  ValidationError,
} from "./types";

function err(nodeId: string | null, code: string, message: string): ValidationError {
  return { nodeId, code, message };
}

/** Detect cycle via DFS. Returns a node id on the cycle if found. */
function findCycleNode(graph: RuleGraphJson): string | null {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 done
  for (const n of graph.nodes) state.set(n.id, 0);

  let cycleAt: string | null = null;
  function dfs(id: string): boolean {
    state.set(id, 1);
    for (const t of adj.get(id) ?? []) {
      const s = state.get(t) ?? 0;
      if (s === 1) {
        cycleAt = t;
        return true;
      }
      if (s === 0 && dfs(t)) return true;
    }
    state.set(id, 2);
    return false;
  }
  for (const n of graph.nodes) {
    if (state.get(n.id) === 0 && dfs(n.id)) return cycleAt;
  }
  return null;
}

function bandsValid(bands: RangeBand[]): { ok: true } | { ok: false; message: string } {
  if (bands.length === 0) return { ok: false, message: "Range has no bands" };
  const sorted = [...bands].sort((a, b) => {
    const am = a.minCm ?? Number.NEGATIVE_INFINITY;
    const bm = b.minCm ?? Number.NEGATIVE_INFINITY;
    return am - bm;
  });
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]!;
    const min = b.minCm ?? Number.NEGATIVE_INFINITY;
    const max = b.maxCm ?? Number.POSITIVE_INFINITY;
    if (!(min < max)) {
      return { ok: false, message: `Band "${b.label}" has min >= max` };
    }
    if (i > 0) {
      const prev = sorted[i - 1]!;
      const prevMax = prev.maxCm ?? Number.POSITIVE_INFINITY;
      if (prevMax > min) {
        return { ok: false, message: `Bands "${prev.label}" and "${b.label}" overlap` };
      }
      if (prevMax < min) {
        return {
          ok: false,
          message: `Gap between bands "${prev.label}" and "${b.label}"`,
        };
      }
    }
  }
  return { ok: true };
}

function reachableFrom(
  graph: RuleGraphJson,
  startIds: string[],
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const seen = new Set<string>();
  const q = [...startIds];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of adj.get(id) ?? []) q.push(t);
  }
  return seen;
}

function ancestorsOf(graph: RuleGraphJson, targetId: string): Set<string> {
  const pred = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = pred.get(e.target) ?? [];
    list.push(e.source);
    pred.set(e.target, list);
  }
  const seen = new Set<string>();
  const q = [targetId];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of pred.get(id) ?? []) q.push(p);
  }
  return seen;
}

function sizeOnPathTo(
  graph: RuleGraphJson,
  nodes: Map<string, RuleNode>,
  terminalId: string,
): SizeOrLength | null {
  const anc = ancestorsOf(graph, terminalId);
  for (const id of anc) {
    const n = nodes.get(id);
    if (n?.type === "size-output") return n.size;
  }
  return null;
}

const TERMINAL_TYPES = new Set([
  "size-output",
  "template-output",
  "tier-suggestion",
  "flow-route",
  "fallback",
]);

/**
 * Publish validation. Pure — errors reference offending node ids.
 */
export function validateForPublish(
  flow: RuleFlow,
  graph: RuleGraphJson,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const keys = catalogKeys(flow);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const ids = new Set(graph.nodes.map((n) => n.id));

  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      errors.push(err(e.source, "dangling-edge", `Edge ${e.id} references missing node`));
    }
  }

  const cycleAt = findCycleNode(graph);
  if (cycleAt) {
    errors.push(err(cycleAt, "cycle", "Graph contains a cycle"));
  }

  for (const n of graph.nodes) {
    if (n.type === "input" || n.type === "range" || n.type === "match") {
      const key = n.inputKey;
      if (!keys.has(key)) {
        errors.push(
          err(n.id, "off-catalog-input", `Input "${key}" is not in the ${flow} catalog`),
        );
      }
    }
    if (n.type === "range") {
      const def = catalogDef(flow, n.inputKey);
      if (def && def.valueType !== "number") {
        errors.push(err(n.id, "range-non-numeric", `Range on non-numeric input "${n.inputKey}"`));
      }
      const bv = bandsValid((n as RangeNode).bands);
      if (!bv.ok) errors.push(err(n.id, "band-invalid", bv.message));
    }
    if (n.type === "flow-route") {
      if (n.targetFlow === flow) {
        errors.push(err(n.id, "flow-route-self", "Flow route must target a different flow"));
      }
      const sib = nodes.get(n.fallbackSiblingId);
      if (!sib || sib.type !== "fallback") {
        errors.push(
          err(
            n.id,
            "flow-route-no-fallback",
            "Flow route requires a same-flow Fallback sibling",
          ),
        );
      }
    }
  }

  const fallbacks = graph.nodes.filter((n) => n.type === "fallback");
  if (fallbacks.length === 0) {
    errors.push(err(null, "no-fallback", "Graph must include a Fallback terminal"));
  }

  const inputIds = graph.nodes.filter((n) => n.type === "input").map((n) => n.id);
  const reachable = reachableFrom(graph, inputIds);

  for (const fb of fallbacks) {
    if (!reachable.has(fb.id)) {
      // Fallback may be a catch-all with no inbound from inputs — still require
      // it to be present; "unreachable" means no edge can ever activate it AND
      // it isn't wired as an orphan catch-all. Require at least one inbound edge
      // OR allow zero-inbound as explicit catch-all (engine activates it).
      const hasInbound = graph.edges.some((e) => e.target === fb.id);
      if (hasInbound && !reachable.has(fb.id)) {
        errors.push(err(fb.id, "unreachable-fallback", "Fallback is not reachable"));
      }
    }
  }

  // Every non-terminal node on a path from inputs must be able to reach a terminal.
  const revAdj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = revAdj.get(e.target) ?? [];
    list.push(e.source);
    revAdj.set(e.target, list);
  }
  const canReachTerminal = new Set<string>();
  const tq = graph.nodes.filter((n) => TERMINAL_TYPES.has(n.type)).map((n) => n.id);
  for (const id of tq) canReachTerminal.add(id);
  const grow = [...tq];
  while (grow.length) {
    const id = grow.shift()!;
    for (const p of revAdj.get(id) ?? []) {
      if (canReachTerminal.has(p)) continue;
      canReachTerminal.add(p);
      grow.push(p);
    }
  }
  for (const n of graph.nodes) {
    if (TERMINAL_TYPES.has(n.type)) continue;
    if (reachable.has(n.id) && !canReachTerminal.has(n.id)) {
      errors.push(err(n.id, "non-terminating", "Path from this node never reaches a terminal"));
    }
  }

  for (const n of graph.nodes) {
    if (n.type !== "template-output") continue;
    const pathSize = sizeOnPathTo(graph, nodes, n.id);
    if (pathSize != null && pathSize !== n.size) {
      errors.push(
        err(
          n.id,
          "wrong-size-template",
          `Template scoped to ${n.size} but path resolves size ${pathSize}`,
        ),
      );
    }
    if (pathSize == null) {
      // Template must be preceded by a Size output on some ancestor path
      errors.push(
        err(n.id, "wrong-size-template", "Template output is not preceded by a Size output"),
      );
    }
  }

  return errors;
}

export function assertPublishable(
  flow: RuleFlow,
  graph: RuleGraphJson,
): { ok: true } | { ok: false; errors: ValidationError[] } {
  const errors = validateForPublish(flow, graph);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
