export const RULE_FLOWS = ["premium-mpillow", "basic-mpillow", "mbolster"] as const;
export type RuleFlow = (typeof RULE_FLOWS)[number];

export const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type PillowSize = (typeof PILLOW_SIZES)[number];

export const BOLSTER_LENGTHS = ["short", "medium", "long"] as const;
export type BolsterLength = (typeof BOLSTER_LENGTHS)[number];

export type SizeOrLength = PillowSize | BolsterLength;

export type InputValueType = "number" | "enum" | "boolean" | "string" | "string[]";

export type InputDef = {
  key: string;
  valueType: InputValueType;
  values?: readonly string[];
};

export type RangeBand = {
  id: string;
  minCm: number | null;
  maxCm: number | null;
  label: string;
};

export type NodeBase = {
  id: string;
  label?: string;
  position?: { x: number; y: number };
};

export type InputNode = NodeBase & { type: "input"; inputKey: string };
export type RangeNode = NodeBase & { type: "range"; inputKey: string; bands: RangeBand[] };
export type MatchNode = NodeBase & { type: "match"; inputKey: string };
export type CombineNode = NodeBase & {
  type: "combine";
  mode?: "all" | "any";
};
export type SizeOutputNode = NodeBase & { type: "size-output"; size: SizeOrLength };
export type TemplateOutputNode = NodeBase & {
  type: "template-output";
  templateId: string;
  size: SizeOrLength;
};
export type TemplateBySizeNode = NodeBase & {
  type: "template-by-size";
  templates: Partial<Record<SizeOrLength, string>>;
};
export type TierSuggestionNode = NodeBase & {
  type: "tier-suggestion";
  tier: "basic" | "premium";
};
export type FlowRouteNode = NodeBase & {
  type: "flow-route";
  targetFlow: RuleFlow;
  reason: string;
  fallbackSiblingId: string;
};
export type FallbackNode = NodeBase & {
  type: "fallback";
  size: SizeOrLength;
  templateId?: string;
};

export type RuleNode =
  | InputNode
  | RangeNode
  | MatchNode
  | CombineNode
  | SizeOutputNode
  | TemplateOutputNode
  | TemplateBySizeNode
  | TierSuggestionNode
  | FlowRouteNode
  | FallbackNode;

export type RuleEdge = {
  id: string;
  source: string;
  target: string;
  handle?: string;
};

export type RuleGraphJson = {
  nodes: RuleNode[];
  edges: RuleEdge[];
};

export type EngineInputs = Record<string, unknown>;

export type FlowRouteDecision = "pending" | "accepted" | "declined";

export type TraceStep = {
  nodeId: string;
  type: RuleNode["type"];
  detail?: string;
};

export type FiredTerminal = {
  nodeId: string;
  type: RuleNode["type"];
};

export type EvaluateResult = {
  size: SizeOrLength | null;
  templateId: string | null;
  tierSuggestion: "basic" | "premium" | null;
  flowRoute: { targetFlow: RuleFlow; reason: string; nodeId: string } | null;
  firedTerminals: FiredTerminal[];
  trace: TraceStep[];
  usedFallback: boolean;
};

export type ValidationError = {
  nodeId: string | null;
  code: string;
  message: string;
};

export type RuleGraphRow = {
  id: string;
  flow: RuleFlow;
  version: number | null;
  status: "draft" | "published";
  graph: RuleGraphJson;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type RuleGraphSummary = Omit<RuleGraphRow, "graph">;
