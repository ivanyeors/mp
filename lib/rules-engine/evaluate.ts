import { missingRequiredInputs } from "./catalog";
import type {
  CombineNode,
  EngineInputs,
  EvaluateResult,
  FallbackNode,
  FiredTerminal,
  FlowRouteNode,
  MatchNode,
  RangeBand,
  RangeNode,
  RuleFlow,
  RuleGraphJson,
  RuleNode,
  SizeOrLength,
  TemplateBySizeNode,
  TemplateOutputNode,
  TierSuggestionNode,
  TraceStep,
} from "./types";

function bandMatches(band: RangeBand, value: number): boolean {
  if (band.minCm != null && value < band.minCm) return false;
  if (band.maxCm != null && value >= band.maxCm) return false;
  return true;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function matchValue(input: unknown): string {
  if (typeof input === "boolean") return input ? "true" : "false";
  if (Array.isArray(input)) return input.map(String).sort().join(",");
  return String(input);
}

type Adj = Map<string, { edgeId: string; target: string; handle?: string }[]>;

function buildAdj(graph: RuleGraphJson): Adj {
  const adj: Adj = new Map();
  for (const e of graph.edges) {
    const list = adj.get(e.source) ?? [];
    list.push({ edgeId: e.id, target: e.target, handle: e.handle });
    adj.set(e.source, list);
  }
  return adj;
}

function nodeMap(graph: RuleGraphJson): Map<string, RuleNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

/**
 * Pure, deterministic evaluation. No I/O.
 * Refuses missing required inputs rather than inventing defaults.
 */
export function evaluate(
  flow: RuleFlow,
  graph: RuleGraphJson,
  inputs: EngineInputs,
): EvaluateResult | { error: string; missing: string[] } {
  const missing = missingRequiredInputs(flow, inputs, graph);
  if (missing.length > 0) {
    return {
      error: `Missing required inputs: ${missing.join(", ")}`,
      missing,
    };
  }

  const nodes = nodeMap(graph);
  const adj = buildAdj(graph);
  const trace: TraceStep[] = [];
  const firedTerminals: FiredTerminal[] = [];

  let size: SizeOrLength | null = null;
  let templateId: string | null = null;
  let tierSuggestion: "basic" | "premium" | null = null;
  let flowRoute: EvaluateResult["flowRoute"] = null;
  let usedFallback = false;

  /** Nodes whose prerequisites are satisfied (Combine needs all inbound). */
  const active = new Set<string>();
  const inboundCount = new Map<string, number>();
  const inboundSatisfied = new Map<string, number>();

  for (const e of graph.edges) {
    inboundCount.set(e.target, (inboundCount.get(e.target) ?? 0) + 1);
  }

  // One pass over the nodes seeds the inputs, the Range band lookups and the
  // Fallback node — each of which used to be an O(n) scan at its use site.
  const queue: string[] = [];
  /** Range node id → band id → band (first wins, matching `bands.find`). */
  const bandsById = new Map<string, Map<string, RangeBand>>();
  let fallbackNode: FallbackNode | null = null;
  for (const n of graph.nodes) {
    if (n.type === "input") {
      active.add(n.id);
      queue.push(n.id);
      trace.push({ nodeId: n.id, type: "input", detail: n.inputKey });
      continue;
    }
    if (n.type === "range") {
      const byId = new Map<string, RangeBand>();
      for (const b of (n as RangeNode).bands) if (!byId.has(b.id)) byId.set(b.id, b);
      bandsById.set(n.id, byId);
      continue;
    }
    if (n.type === "fallback" && !fallbackNode) fallbackNode = n;
  }

  function activate(id: string, detail?: string) {
    if (active.has(id)) return;
    const n = nodes.get(id);
    if (!n) return;
    active.add(id);
    queue.push(id);
    trace.push({ nodeId: id, type: n.type, detail });
  }

  function tryActivateTarget(targetId: string, detail?: string) {
    const n = nodes.get(targetId);
    if (!n) return;
    if (n.type === "combine") {
      if (n.mode === "any") {
        activate(targetId, "any");
        return;
      }
      const sat = (inboundSatisfied.get(targetId) ?? 0) + 1;
      inboundSatisfied.set(targetId, sat);
      const need = inboundCount.get(targetId) ?? 0;
      if (sat >= need && need > 0) activate(targetId, "and");
      return;
    }
    activate(targetId, detail);
  }

  function fireTerminal(n: RuleNode) {
    firedTerminals.push({ nodeId: n.id, type: n.type });
    switch (n.type) {
      case "size-output":
        size = n.size;
        break;
      case "template-output":
        templateId = n.templateId;
        if (!size) size = n.size;
        break;
      case "tier-suggestion":
        tierSuggestion = n.tier;
        break;
      case "flow-route":
        flowRoute = {
          targetFlow: n.targetFlow,
          reason: n.reason,
          nodeId: n.id,
        };
        break;
      case "fallback": {
        usedFallback = true;
        size = n.size;
        if (n.templateId) templateId = n.templateId;
        break;
      }
      default:
        break;
    }
  }

  const visitedEdges = new Set<string>();
  /** Size-keyed Template outputs reached; resolved once the size is known. */
  const bySizeReached: TemplateBySizeNode[] = [];

  // Head index instead of `queue.shift()`: shift is O(n) per pop on large graphs.
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const n = nodes.get(id);
    if (!n) continue;

    if (
      n.type === "size-output" ||
      n.type === "template-output" ||
      n.type === "tier-suggestion" ||
      n.type === "flow-route" ||
      n.type === "fallback"
    ) {
      fireTerminal(n);
      // Terminals may still have outgoing edges (e.g. size → template).
    }
    if (n.type === "template-by-size") bySizeReached.push(n);

    const outs = adj.get(id) ?? [];
    for (const out of outs) {
      if (visitedEdges.has(out.edgeId)) continue;

      if (n.type === "range") {
        const num = asNumber(inputs[(n as RangeNode).inputKey]);
        if (num == null) continue;
        const band = out.handle == null ? undefined : bandsById.get(id)?.get(out.handle);
        if (!band || !bandMatches(band, num)) continue;
        visitedEdges.add(out.edgeId);
        tryActivateTarget(out.target, `band:${band.label}`);
        continue;
      }

      if (n.type === "match") {
        const raw = inputs[(n as MatchNode).inputKey];
        const want = out.handle ?? "";
        // string[] Match: handle is a single chip; fire if array includes it
        if (Array.isArray(raw)) {
          if (!raw.map(String).includes(want)) continue;
        } else if (matchValue(raw) !== want) {
          continue;
        }
        visitedEdges.add(out.edgeId);
        tryActivateTarget(out.target, `match:${want}`);
        continue;
      }

      if (n.type === "combine") {
        visitedEdges.add(out.edgeId);
        tryActivateTarget(out.target);
        continue;
      }

      if (n.type === "input") {
        visitedEdges.add(out.edgeId);
        tryActivateTarget(out.target);
        continue;
      }

      // Pass-through from terminals / other active nodes
      visitedEdges.add(out.edgeId);
      tryActivateTarget(out.target);
    }
  }

  // A size-keyed Template output fires only with a slot for the resolved size —
  // otherwise it must not count, or it would keep the Fallback from answering.
  for (const n of bySizeReached) {
    const id = size ? n.templates[size] : undefined;
    if (!id) continue;
    firedTerminals.push({ nodeId: n.id, type: n.type });
    templateId = id;
  }

  // If nothing terminal fired, walk Fallback if present and no path activated it.
  if (firedTerminals.length === 0 && fallbackNode) {
    activate(fallbackNode.id, "unreachable-path-fallback");
    fireTerminal(fallbackNode);
  }

  // Suppress unused locals for type-only imports kept for clarity
  void (null as unknown as CombineNode | FlowRouteNode | TemplateOutputNode | TierSuggestionNode);

  return {
    size,
    templateId,
    tierSuggestion,
    flowRoute,
    firedTerminals,
    trace,
    usedFallback,
  };
}

/** Determinism helper for tests. */
export function evaluateOrThrow(
  flow: RuleFlow,
  graph: RuleGraphJson,
  inputs: EngineInputs,
): EvaluateResult {
  const r = evaluate(flow, graph, inputs);
  if ("error" in r) throw new Error(r.error);
  return r;
}
