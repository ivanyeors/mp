import type { Edge, Node } from "@xyflow/react";
import type { RuleEdge, RuleGraphJson, RuleNode, ValidationError } from "./types";

export type RuleNodeData = {
  rule: RuleNode;
  error?: string;
  fired?: boolean;
};

export function graphToRf(
  graph: RuleGraphJson,
): { nodes: Node<RuleNodeData>[]; edges: Edge[] } {
  const nodes: Node<RuleNodeData>[] = graph.nodes.map((rule, i) => ({
    id: rule.id,
    type: rule.type,
    position: rule.position ?? { x: (i % 5) * 240, y: Math.floor(i / 5) * 160 },
    data: { rule },
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.handle,
  }));
  return { nodes, edges };
}

const FIRED_EDGE_STYLE = { stroke: "#16a34a", strokeWidth: 2.5 };

export function withOverlay(
  nodes: Node<RuleNodeData>[],
  edges: Edge[],
  errors: ValidationError[],
  firedIds: ReadonlySet<string>,
): { nodes: Node<RuleNodeData>[]; edges: Edge[] } {
  const errBy = new Map(
    errors.filter((e) => e.nodeId).map((e) => [e.nodeId!, e.message]),
  );
  return {
    nodes: nodes.map((n) => {
      const error = errBy.get(n.id);
      const fired = firedIds.has(n.id);
      return error || fired ? { ...n, data: { ...n.data, error, fired } } : n;
    }),
    edges: edges.map((e) =>
      firedIds.has(e.source) && firedIds.has(e.target)
        ? { ...e, animated: true, style: FIRED_EDGE_STYLE }
        : e,
    ),
  };
}

export function rfToGraph(
  nodes: Node<RuleNodeData>[],
  edges: Edge[],
): RuleGraphJson {
  return {
    nodes: nodes.map((n): RuleNode => ({
      ...n.data.rule,
      id: n.id,
      position: n.position,
    })),
    edges: edges.map(
      (e): RuleEdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { handle: e.sourceHandle } : {}),
      }),
    ),
  };
}

export function newNodeId(type: RuleNode["type"]): string {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}
