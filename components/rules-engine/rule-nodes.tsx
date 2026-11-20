"use client";

import { Fragment, createContext, useContext, type ReactNode } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { catalogDef } from "@/lib/rules-engine/catalog";
import { BOLSTER_LENGTHS, PILLOW_SIZES, type RuleFlow, type RuleNode } from "@/lib/rules-engine/types";
import type { RuleNodeData } from "@/lib/rules-engine/graph-rf";
import { cn } from "@/lib/utils";

function Shell({
  title,
  subtitle,
  error,
  fired,
  children,
  selected,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  fired?: boolean;
  children?: ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[160px] max-w-[220px] rounded-md border bg-card px-2 py-1.5 text-xs shadow-sm",
        selected && "ring-2 ring-ring",
        fired && "border-green-600 bg-green-50 dark:bg-green-950/40",
        error && "border-destructive",
      )}
    >
      <div className="font-medium leading-tight">{title}</div>
      {subtitle ? (
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
      ) : null}
      {error ? (
        <div className="mt-1 text-[10px] text-destructive leading-snug">{error}</div>
      ) : null}
      {children}
    </div>
  );
}

function Target({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <Handle
      type="target"
      position={Position.Left}
      className="!h-2.5 !w-2.5 !bg-muted-foreground"
    />
  );
}

type Props = NodeProps<Node<RuleNodeData>> & { flow: RuleFlow };

export const TemplateNamesContext = createContext<Record<string, string>>({});

function ruleTitle(rule: RuleNode): string {
  return rule.label ?? rule.type;
}

export function makeNodeTypes(flow: RuleFlow) {
  function wrap(
    render: (p: Props) => ReactNode,
  ): (p: NodeProps<Node<RuleNodeData>>) => ReactNode {
    return (p) => render({ ...p, flow });
  }

  return {
    input: wrap(InputNode),
    range: wrap(RangeNodeView),
    match: wrap(MatchNodeView),
    combine: wrap(CombineNodeView),
    "size-output": wrap(SizeOutView),
    "template-output": wrap(TemplateOutView),
    "template-by-size": wrap(TemplateBySizeView),
    "tier-suggestion": wrap(TierView),
    "flow-route": wrap(FlowRouteView),
    fallback: wrap(FallbackView),
  };
}

function InputNode({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "input") return null;
  return (
    <Shell
      title="Input"
      subtitle={rule.inputKey}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target hidden />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !bg-sky-600"
      />
    </Shell>
  );
}

function RangeNodeView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "range") return null;
  return (
    <Shell
      title="Range"
      subtitle={rule.inputKey}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
      <div className="mt-1 space-y-0.5">
        {rule.bands.map((b) => (
          <div
            key={b.id}
            className="relative flex items-center justify-end gap-1 pr-1 text-[10px] text-muted-foreground"
          >
            <span className="truncate">{b.label || b.id}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={b.id}
              className="!static !h-2 !w-2 !translate-y-0 !bg-amber-600"
            />
          </div>
        ))}
      </div>
    </Shell>
  );
}

function MatchNodeView({ data, selected, flow }: Props) {
  const rule = data.rule;
  if (rule.type !== "match") return null;
  const def = catalogDef(flow, rule.inputKey);
  const values = def?.values ?? [];
  return (
    <Shell
      title="Match"
      subtitle={rule.inputKey}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
      <div className="mt-1 space-y-0.5">
        {values.map((v) => (
          <div
            key={v}
            className="relative flex items-center justify-end gap-1 pr-1 text-[10px] text-muted-foreground"
          >
            <span className="truncate">{v}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={v}
              className="!static !h-2 !w-2 !translate-y-0 !bg-violet-600"
            />
          </div>
        ))}
      </div>
    </Shell>
  );
}

function CombineNodeView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "combine") return null;
  return (
    <Shell
      title={rule.mode === "any" ? "Combine (OR)" : "Combine (AND)"}
      subtitle={rule.label}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-muted-foreground" />
    </Shell>
  );
}

function SizeOutView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "size-output") return null;
  return (
    <Shell
      title="Size"
      subtitle={rule.size}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-emerald-600" />
    </Shell>
  );
}

function TemplateOutView({ data, selected }: Props) {
  const names = useContext(TemplateNamesContext);
  const rule = data.rule;
  if (rule.type !== "template-output") return null;
  const template = rule.templateId ? (names[rule.templateId] ?? rule.templateId) : "—";
  return (
    <Shell
      title="Template"
      subtitle={`${rule.size} · ${template}`}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
    </Shell>
  );
}

function TemplateBySizeView({ data, selected, flow }: Props) {
  const names = useContext(TemplateNamesContext);
  const rule = data.rule;
  if (rule.type !== "template-by-size") return null;
  const sizes = flow === "mbolster" ? BOLSTER_LENGTHS : PILLOW_SIZES;
  return (
    <Shell
      title="Template by size"
      subtitle={rule.label}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[10px]">
        {sizes.map((s) => {
          const id = rule.templates[s];
          return (
            <Fragment key={s}>
              <dt className="text-muted-foreground">{s}</dt>
              <dd className="truncate">{id ? (names[id] ?? id) : "—"}</dd>
            </Fragment>
          );
        })}
      </dl>
    </Shell>
  );
}

function TierView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "tier-suggestion") return null;
  return (
    <Shell
      title="Tier suggestion"
      subtitle={rule.tier}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
    </Shell>
  );
}

function FlowRouteView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "flow-route") return null;
  return (
    <Shell
      title="Flow route"
      subtitle={rule.targetFlow}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
    </Shell>
  );
}

function FallbackView({ data, selected }: Props) {
  const rule = data.rule;
  if (rule.type !== "fallback") return null;
  return (
    <Shell
      title={ruleTitle(rule) === "fallback" ? "Fallback" : ruleTitle(rule)}
      subtitle={rule.size}
      error={data.error}
      fired={data.fired}
      selected={selected}
    >
      <Target />
    </Shell>
  );
}
