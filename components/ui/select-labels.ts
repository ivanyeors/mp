import * as React from "react";

export const SELECT_ITEM_MARK = Symbol.for("mp.select.item");

export function flattenChildrenToLabel(children: React.ReactNode): string {
  const parts: string[] = [];
  React.Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      parts.push(String(child));
      return;
    }
    if (!React.isValidElement(child)) return;
    const props = child.props as { children?: React.ReactNode };
    if (props.children != null) {
      const nested = flattenChildrenToLabel(props.children);
      if (nested) parts.push(nested);
    }
  });
  return parts.join("");
}

function isSelectItemElement(element: React.ReactElement): boolean {
  const type = element.type as { displayName?: string; [SELECT_ITEM_MARK]?: true };
  return type?.[SELECT_ITEM_MARK] === true || type?.displayName === "SelectItem";
}

export function selectItemLabel(props: {
  value: string;
  textValue?: string;
  children?: React.ReactNode;
}): string {
  if (typeof props.textValue === "string") return props.textValue;
  const flattened = flattenChildrenToLabel(props.children);
  return flattened || props.value;
}

export function collectSelectItemLabels(
  node: React.ReactNode,
  labels: Record<string, string> = {},
): Record<string, string> {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;

    if (isSelectItemElement(child)) {
      const props = child.props as {
        value: string;
        textValue?: string;
        children?: React.ReactNode;
      };
      labels[props.value] = selectItemLabel(props);
      return;
    }

    const props = child.props as { children?: React.ReactNode };
    if (props.children != null) {
      collectSelectItemLabels(props.children, labels);
    }
  });
  return labels;
}

export function resolveSelectDisplay(
  value: string | undefined,
  labels: Record<string, string>,
  placeholder?: string,
): string {
  const fallback = placeholder ?? "Select";
  if (value === undefined || value === null) return fallback;
  if (value === "") return labels[""] ?? fallback;
  return labels[value] ?? fallback;
}
