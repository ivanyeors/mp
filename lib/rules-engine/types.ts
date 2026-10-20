/** Rules Engine — typed Rule graph model (slice 01). Pure data; no I/O. */

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
  /** Enum / Match values when valueType is enum or boolean. */
  values?: readonly string[];
};

export type RangeBand = {
  id: string;
  /** Inclusive lower bound in canonical cm. Null = -∞. */
  minCm: number | null;
  /** Exclusive upper bound in canonical cm. Null = +∞. */
  maxCm: number | null;
  label: string;
};

export type NodeBase = {
  id: string;
  label?: string;
  /** Canvas authoring position (workbench UI only; ignored by evaluate/validate). */
  position?: { x: number; y: number };
};

export type InputNode = NodeBase & { type: "input"; inputKey: string };
export type RangeNode = NodeBase & { type: "range"; inputKey: string; bands: RangeBand[] };
export type MatchNode = NodeBase & { type: "match"; inputKey: string };
export type CombineNode = NodeBase & {
  type: "combine";
  /** "all" (default) needs every inbound branch; "any" fires on the first (ADR 0027). */
  mode?: "all" | "any";
};
export type SizeOutputNode = NodeBase & { type: "size-output"; size: SizeOrLength };
export type TemplateOutputNode = NodeBase & {
  type: "template-output";
  templateId: string;
  /** Size/length this template is scoped to (publish-validated against path). */
  size: SizeOrLength;
};
/**
 * One Filling Template per size (length for Mbolster). The size the graph
 * resolved picks the slot, so the branches before it need not split by size
 * (ADR 0027). No slot for that size means it did not fire.
 */
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
  /** Same-flow Fallback sibling required at publish. */
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
  /** Band id (Range) or match value (Match). */
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

/** A published version without its graph; the graph is fetched on demand. */
export type RuleGraphSummary = Omit<RuleGraphRow, "graph">;
