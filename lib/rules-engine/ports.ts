import type { InputValueType, RuleNode } from "./types";

export type PortKind = "number" | "enum" | "signal" | "size";

export function inputValuePort(valueType: InputValueType): PortKind {
  return valueType === "number" ? "number" : "enum";
}

export function sourcePort(
  node: Pick<RuleNode, "type">,
  inputValueType?: InputValueType,
): PortKind {
  switch (node.type) {
    case "input":
      return inputValuePort(inputValueType ?? "string");
    case "size-output":
      return "size";
    default:
      return "signal";
  }
}

export function targetPort(node: Pick<RuleNode, "type">): PortKind | null {
  switch (node.type) {
    case "input":
      return null;
    case "range":
      return "number";
    case "match":
      return "enum";
    case "template-output":
      return "size";
    default:
      return "signal";
  }
}

export function canConnect(
  source: PortKind,
  target: PortKind | null,
): boolean {
  if (target == null) return false;
  if (source === target) return true;
  // ponytail: signal is the catch-all activation wire; size stays strict for templates
  if (target === "signal" && source !== "size") return true;
  return false;
}
