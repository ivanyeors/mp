/** RuleGraphJson ↔ React Flow node/edge shapes (authoring only). */
import type { Edge, Node } from "@xyflow/react";
import type { RuleEdge, RuleGraphJson, RuleNode, ValidationError } from "./types";

export type RuleNodeData = {
  rule: RuleNode;
  error?: string;
  fired?: boolean;
};

export function graphToRf(
  graph: RuleGraphJson,
  errors: ValidationError[] = [],
  firedIds: ReadonlySet<string> = new Set(),
): { nodes: Node<RuleNodeData>[]; edges: Edge[] } {
  const errBy = new Map(
    errors.filter((e) => e.nodeId).map((e) => [e.nodeId!, e.message]),
  );
  const nodes: Node<RuleNodeData>[] = graph.nodes.map((rule, i) => ({
    id: rule.id,
    type: rule.type,
    position: rule.position ?? { x: (i % 5) * 240, y: Math.floor(i / 5) * 160 },
    data: {
      rule,
      error: errBy.get(rule.id),
      fired: firedIds.has(rule.id),
    },
  }));
  const edges: Edge[] = graph.edges.map((e) => {
    const onPath = firedIds.has(e.source) && firedIds.has(e.target);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.handle,
      animated: onPath,
      style: onPath ? { stroke: "#16a34a", strokeWidth: 2.5 } : undefined,
    };
  });
  return { nodes, edges };
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
