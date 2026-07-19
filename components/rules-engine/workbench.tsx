"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/style.css";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  catalogDef,
  inputCatalog,
} from "@/lib/rules-engine/catalog";
import { evaluate } from "@/lib/rules-engine/evaluate";
import { FLOW_LABELS, FLOW_OPTIONS } from "@/lib/rules-engine/flow-labels";
import {
  graphToRf,
  newNodeId,
  rfToGraph,
  type RuleNodeData,
} from "@/lib/rules-engine/graph-rf";
import { canConnect, sourcePort, targetPort } from "@/lib/rules-engine/ports";
import {
  BOLSTER_LENGTHS,
  PILLOW_SIZES,
  RULE_FLOWS,
  type EngineInputs,
  type EvaluateResult,
  type RangeBand,
  type RuleFlow,
  type RuleGraphJson,
  type RuleGraphRow,
  type RuleNode,
  type SizeOrLength,
  type ValidationError,
} from "@/lib/rules-engine/types";
import { cmToInches, inchesToCm, roundCm } from "@/lib/rules-engine/units";
import { validateForPublish } from "@/lib/rules-engine/validate";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getApiErrorMessage } from "@/lib/utils";
import { makeNodeTypes } from "./rule-nodes";

const PALETTE: { type: RuleNode["type"]; label: string }[] = [
  { type: "input", label: "Input" },
  { type: "range", label: "Range" },
  { type: "match", label: "Match" },
  { type: "combine", label: "Combine" },
  { type: "size-output", label: "Size" },
  { type: "template-output", label: "Template" },
  { type: "tier-suggestion", label: "Tier" },
  { type: "flow-route", label: "Flow route" },
  { type: "fallback", label: "Fallback" },
];

function defaultRule(type: RuleNode["type"], flow: RuleFlow): RuleNode {
  const id = newNodeId(type);
  const catalog = inputCatalog(flow);
  const firstNum = catalog.find((c) => c.valueType === "number")?.key ?? catalog[0]?.key ?? "";
  const firstEnum = catalog.find((c) => c.valueType !== "number")?.key ?? firstNum;
  const size: SizeOrLength = flow === "mbolster" ? "medium" : "M";
  switch (type) {
    case "input":
      return { id, type, inputKey: firstNum };
    case "range":
      return {
        id,
        type,
        inputKey: firstNum,
        bands: [
          { id: "b-lo", minCm: null, maxCm: 40, label: "low" },
          { id: "b-hi", minCm: 40, maxCm: null, label: "high" },
        ],
      };
    case "match":
      return { id, type, inputKey: firstEnum };
    case "combine":
      return { id, type };
    case "size-output":
      return { id, type, size };
    case "template-output":
      return { id, type, size, templateId: "" };
    case "tier-suggestion":
      return { id, type, tier: "premium" };
    case "flow-route":
      return {
        id,
        type,
        targetFlow: RULE_FLOWS.find((f) => f !== flow) ?? "premium-mpillow",
        reason: "",
        fallbackSiblingId: "",
      };
    case "fallback":
      return { id, type, size };
  }
}

function apiBase(flow: RuleFlow) {
  return `/api/settings/rules-engine/${flow}`;
}

export function RulesEngineWorkbench({ flow }: { flow: RuleFlow }) {
  return (
    <ReactFlowProvider>
      <WorkbenchInner flow={flow} />
    </ReactFlowProvider>
  );
}

function WorkbenchInner({ flow }: { flow: RuleFlow }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((p: string) => withLocale(p, locale), [locale]);
  useSettingsBreadcrumbDetail(FLOW_LABELS[flow]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RuleNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<RuleGraphRow | null>(null);
  const [versions, setVersions] = useState<RuleGraphRow[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishErrors, setPublishErrors] = useState<ValidationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [testInputs, setTestInputs] = useState<EngineInputs>({});
  const [testResult, setTestResult] = useState<EvaluateResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const draftGraphRef = useRef<RuleGraphJson>({ nodes: [], edges: [] });
  const skipAutosave = useRef(true);
  const nodeTypes = useMemo(() => makeNodeTypes(flow), [flow]);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, vRes] = await Promise.all([
        fetch(apiBase(flow)),
        fetch(`${apiBase(flow)}/versions`),
      ]);
      const dJson = await dRes.json();
      const vJson = await vRes.json();
      if (!dRes.ok) {
        toast.error(getApiErrorMessage(dJson.error, "Failed to load draft"));
        return;
      }
      const graph: RuleGraphJson = dJson.draft?.graph ?? { nodes: [], edges: [] };
      draftGraphRef.current = graph;
      const rf = graphToRf(graph);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setVersions(vJson.versions ?? []);
      setViewingVersion(null);
      setReadOnly(false);
      setPublishErrors([]);
      setTestResult(null);
      // Seed test panel with catalog defaults (numeric empty / first enum)
      const seed: EngineInputs = {};
      for (const def of inputCatalog(flow)) {
        if (def.valueType === "number") seed[def.key] = "";
        else if (def.valueType === "boolean") seed[def.key] = false;
        else if (def.valueType === "string[]") seed[def.key] = [def.values?.[0] ?? "none"];
        else seed[def.key] = def.values?.[0] ?? "";
      }
      setTestInputs(seed);
      skipAutosave.current = true;
    } finally {
      setLoading(false);
    }
  }, [flow, setNodes, setEdges]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const currentGraph = useCallback(
    () => rfToGraph(nodes, edges),
    [nodes, edges],
  );

  // Autosave draft (debounced)
  useEffect(() => {
    if (readOnly || loading) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    const graph = currentGraph();
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(apiBase(flow), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setSaveState("error");
          toast.error(getApiErrorMessage(data.error, "Autosave failed"));
          return;
        }
        draftGraphRef.current = graph;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [nodes, edges, readOnly, loading, flow, currentGraph]);

  const patchRule = useCallback(
    (id: string, next: RuleNode) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, rule: next } } : n,
        ),
      );
    },
    [setNodes],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return false;
      const srcRule = src.data.rule;
      const tgtRule = tgt.data.rule;
      const inDef =
        srcRule.type === "input"
          ? catalogDef(flow, srcRule.inputKey)?.valueType
          : undefined;
      return canConnect(sourcePort(srcRule, inDef), targetPort(tgtRule));
    },
    [nodes, flow],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !isValidConnection(c)) return;
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            id: `e-${Math.random().toString(36).slice(2, 8)}`,
          },
          eds,
        ),
      );
    },
    [readOnly, isValidConnection, setEdges],
  );

  const addNode = (type: RuleNode["type"]) => {
    if (readOnly) return;
    const rule = defaultRule(type, flow);
    const node: Node<RuleNodeData> = {
      id: rule.id,
      type,
      position: { x: 80 + nodes.length * 24, y: 80 + nodes.length * 16 },
      data: { rule },
    };
    setNodes((ns) => [...ns, node]);
  };

  const publish = async () => {
    const graph = currentGraph();
    const localErrs = validateForPublish(flow, graph);
    if (localErrs.length) {
      setPublishErrors(localErrs);
      const rf = graphToRf(graph, localErrs, new Set());
      setNodes(rf.nodes);
      setEdges(rf.edges);
      toast.error(`Publish blocked: ${localErrs.length} error(s)`);
      return;
    }
    // Persist first so server publish validates the latest draft
    const saveRes = await fetch(apiBase(flow), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph }),
    });
    if (!saveRes.ok) {
      toast.error("Could not save before publish");
      return;
    }
    const res = await fetch(`${apiBase(flow)}/publish`, { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const errs: ValidationError[] = data.errors ?? [];
      setPublishErrors(errs);
      const rf = graphToRf(graph, errs, new Set());
      setNodes(rf.nodes);
      setEdges(rf.edges);
      toast.error(getApiErrorMessage(data.error, "Publish failed"));
      return;
    }
    setPublishErrors([]);
    toast.success(`Published v${data.published.version}`);
    await loadDraft();
  };

  const viewVersion = (v: RuleGraphRow | null) => {
    if (!v) {
      const rf = graphToRf(draftGraphRef.current, publishErrors);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setViewingVersion(null);
      setReadOnly(false);
      return;
    }
    const rf = graphToRf(v.graph);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setViewingVersion(v);
    setReadOnly(true);
    setTestResult(null);
  };

  const restore = async (id: string) => {
    const res = await fetch(`${apiBase(flow)}/versions/${id}/restore`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      toast.error(getApiErrorMessage(data.error, "Restore failed"));
      return;
    }
    toast.success("Restored to draft");
    await loadDraft();
  };

  const runTest = () => {
    const graph = currentGraph();
    // Coerce numeric strings → numbers for evaluate
    const inputs: EngineInputs = { ...testInputs };
    for (const def of inputCatalog(flow)) {
      if (def.valueType === "number") {
        const n = Number(inputs[def.key]);
        inputs[def.key] = Number.isFinite(n) ? n : inputs[def.key];
      }
    }
    const result = evaluate(flow, graph, inputs);
    if ("error" in result) {
      setTestError(result.error);
      setTestResult(null);
      setNodes((ns) =>
        ns.map((n) => ({ ...n, data: { ...n.data, fired: false, error: n.data.error } })),
      );
      return;
    }
    setTestError(null);
    setTestResult(result);
    const fired = new Set(result.trace.map((t) => t.nodeId));
    const rf = graphToRf(graph, publishErrors, fired);
    setNodes(rf.nodes);
    setEdges(rf.edges);
  };

  const selected = nodes.find((n) => n.id === selectedId);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 -mx-2 sm:-mx-3 md:-mx-6 lg:-mx-8 -mt-2">
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-3 md:px-6 lg:px-8">
        <h1 className="text-xl font-bold tracking-tight mr-2">Rules Engine</h1>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={flow}
          aria-label="Flow switcher"
          onChange={(e) => {
            const next = e.target.value as RuleFlow;
            window.location.href = to(
              `/settings/product-builder/rules-engine/${next}`,
            );
          }}
        >
          {FLOW_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="text-xs text-muted-foreground">
          {readOnly
            ? `Read-only · v${viewingVersion?.version}`
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Draft saved"
                : saveState === "error"
                  ? "Save error"
                  : "Draft"}
        </div>
        <div className="flex-1" />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={viewingVersion?.id ?? "draft"}
          aria-label="Version"
          onChange={(e) => {
            const id = e.target.value;
            if (id === "draft") viewVersion(null);
            else {
              const v = versions.find((x) => x.id === id) ?? null;
              viewVersion(v);
            }
          }}
        >
          <option value="draft">Draft</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version}
              {v.published_at ? ` · ${v.published_at.slice(0, 10)}` : ""}
            </option>
          ))}
        </select>
        {viewingVersion ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void restore(viewingVersion.id)}
          >
            Restore to draft
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => void publish()}>
            Publish
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={to("/settings/product-builder")}>Product Builder</Link>
        </Button>
      </div>

      <div className="flex gap-0 border-y bg-muted/30" style={{ height: "min(70vh, 720px)" }}>
        {/* Palette */}
        <aside className="w-36 shrink-0 border-r p-2 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-medium uppercase text-muted-foreground mb-1">
            Palette
          </div>
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              disabled={readOnly}
              onClick={() => addNode(p.type)}
              className="w-full rounded border bg-background px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={readOnly ? undefined : onNodesChange}
            onEdgesChange={readOnly ? undefined : onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            onSelectionChange={({ nodes: sel }) =>
              setSelectedId(sel[0]?.id ?? null)
            }
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Editor + test */}
        <aside className="w-72 shrink-0 border-l p-3 space-y-4 overflow-y-auto text-sm">
          <div>
            <div className="text-[10px] font-medium uppercase text-muted-foreground mb-1">
              Node editor
            </div>
            {selected ? (
              <NodeEditor
                flow={flow}
                locale={locale}
                node={selected}
                readOnly={readOnly}
                onChange={(rule) => patchRule(selected.id, rule)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Select a node to edit.</p>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="text-[10px] font-medium uppercase text-muted-foreground mb-2">
              Test panel
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {inputCatalog(flow).map((def) => (
                <div key={def.key} className="space-y-0.5">
                  <Label className="text-[10px]">{def.key}</Label>
                  {def.valueType === "number" ? (
                    <Input
                      type="number"
                      step="any"
                      className="h-8"
                      value={String(testInputs[def.key] ?? "")}
                      onChange={(e) =>
                        setTestInputs((s) => ({ ...s, [def.key]: e.target.value }))
                      }
                    />
                  ) : def.valueType === "string[]" ? (
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      value={String(
                        Array.isArray(testInputs[def.key])
                          ? (testInputs[def.key] as string[])[0]
                          : "",
                      )}
                      onChange={(e) =>
                        setTestInputs((s) => ({ ...s, [def.key]: [e.target.value] }))
                      }
                    >
                      {(def.values ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      value={String(testInputs[def.key] ?? "")}
                      onChange={(e) => {
                        const v =
                          def.valueType === "boolean"
                            ? e.target.value === "true"
                            : e.target.value;
                        setTestInputs((s) => ({ ...s, [def.key]: v }));
                      }}
                    >
                      {(def.values ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" size="sm" className="mt-2 w-full" onClick={runTest}>
              Evaluate
            </Button>
            {testError ? (
              <p className="mt-2 text-xs text-destructive">{testError}</p>
            ) : null}
            {testResult ? (
              <dl className="mt-2 space-y-1 text-xs">
                <div>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-medium">{testResult.size ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Template</dt>
                  <dd className="font-medium break-all">
                    {testResult.templateId ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tier</dt>
                  <dd className="font-medium">{testResult.tierSuggestion ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Flow route</dt>
                  <dd className="font-medium">
                    {testResult.flowRoute
                      ? `${testResult.flowRoute.targetFlow}: ${testResult.flowRoute.reason}`
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function NodeEditor({
  flow,
  locale,
  node,
  readOnly,
  onChange,
}: {
  flow: RuleFlow;
  locale: Locale;
  node: Node<RuleNodeData>;
  readOnly: boolean;
  onChange: (rule: RuleNode) => void;
}) {
  const rule = node.data.rule;
  const disabled = readOnly;

  if (rule.type === "input" || rule.type === "range" || rule.type === "match") {
    const keys = inputCatalog(flow)
      .filter((d) => {
        if (rule.type === "range") return d.valueType === "number";
        if (rule.type === "match") return d.valueType !== "number";
        return true;
      })
      .map((d) => d.key);
    return (
      <div className="space-y-2">
        <Label className="text-[10px]">Input key</Label>
        <select
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={rule.inputKey}
          onChange={(e) => onChange({ ...rule, inputKey: e.target.value })}
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {rule.type === "range" ? (
          <BandsEditor
            bands={rule.bands}
            disabled={disabled}
            onChange={(bands) => onChange({ ...rule, bands })}
          />
        ) : null}
        {rule.type === "match" ? (
          <p className="text-[10px] text-muted-foreground">
            Connect each enum value handle to a branch.
          </p>
        ) : null}
      </div>
    );
  }

  if (rule.type === "size-output" || rule.type === "fallback") {
    const sizes = flow === "mbolster" ? BOLSTER_LENGTHS : PILLOW_SIZES;
    return (
      <div className="space-y-2">
        <Label className="text-[10px]">Size / length</Label>
        <select
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={rule.size}
          onChange={(e) =>
            onChange({ ...rule, size: e.target.value as SizeOrLength })
          }
        >
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {rule.type === "fallback" ? (
          <>
            <Label className="text-[10px]">Template id (optional)</Label>
            <Input
              disabled={disabled}
              className="h-8"
              value={rule.templateId ?? ""}
              onChange={(e) =>
                onChange({ ...rule, templateId: e.target.value || undefined })
              }
            />
          </>
        ) : null}
      </div>
    );
  }

  if (rule.type === "template-output") {
    return (
      <TemplatePicker
        flow={flow}
        locale={locale}
        size={rule.size}
        templateId={rule.templateId}
        disabled={disabled}
        onSize={(size) => onChange({ ...rule, size, templateId: "" })}
        onTemplate={(templateId) => onChange({ ...rule, templateId })}
      />
    );
  }

  if (rule.type === "tier-suggestion") {
    return (
      <div className="space-y-2">
        <Label className="text-[10px]">Tier</Label>
        <select
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={rule.tier}
          onChange={(e) =>
            onChange({
              ...rule,
              tier: e.target.value as "basic" | "premium",
            })
          }
        >
          <option value="basic">basic</option>
          <option value="premium">premium</option>
        </select>
      </div>
    );
  }

  if (rule.type === "flow-route") {
    return (
      <div className="space-y-2">
        <Label className="text-[10px]">Target flow</Label>
        <select
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={rule.targetFlow}
          onChange={(e) =>
            onChange({ ...rule, targetFlow: e.target.value as RuleFlow })
          }
        >
          {FLOW_OPTIONS.filter((o) => o.id !== flow).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Label className="text-[10px]">Reason</Label>
        <Input
          disabled={disabled}
          className="h-8"
          value={rule.reason}
          onChange={(e) => onChange({ ...rule, reason: e.target.value })}
        />
        <Label className="text-[10px]">Fallback sibling id</Label>
        <Input
          disabled={disabled}
          className="h-8"
          value={rule.fallbackSiblingId}
          onChange={(e) =>
            onChange({ ...rule, fallbackSiblingId: e.target.value })
          }
        />
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">No fields for this node.</p>;
}

function BandsEditor({
  bands,
  disabled,
  onChange,
}: {
  bands: RangeBand[];
  disabled: boolean;
  onChange: (bands: RangeBand[]) => void;
}) {
  const setBand = (i: number, patch: Partial<RangeBand>) => {
    const next = bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium">Bands (inches)</div>
      {bands.map((b, i) => (
        <div key={b.id} className="grid grid-cols-3 gap-1">
          <Input
            disabled={disabled}
            className="h-7 text-[11px]"
            placeholder="min"
            type="number"
            step="any"
            value={b.minCm == null ? "" : String(roundIn(cmToInches(b.minCm)))}
            onChange={(e) => {
              const v = e.target.value;
              setBand(i, {
                minCm: v === "" ? null : roundCm(inchesToCm(Number(v))),
              });
            }}
          />
          <Input
            disabled={disabled}
            className="h-7 text-[11px]"
            placeholder="max"
            type="number"
            step="any"
            value={b.maxCm == null ? "" : String(roundIn(cmToInches(b.maxCm)))}
            onChange={(e) => {
              const v = e.target.value;
              setBand(i, {
                maxCm: v === "" ? null : roundCm(inchesToCm(Number(v))),
              });
            }}
          />
          <Input
            disabled={disabled}
            className="h-7 text-[11px]"
            placeholder="label"
            value={b.label}
            onChange={(e) => setBand(i, { label: e.target.value })}
          />
        </div>
      ))}
      {!disabled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() =>
            onChange([
              ...bands,
              {
                id: `b-${Math.random().toString(36).slice(2, 6)}`,
                minCm: null,
                maxCm: null,
                label: "band",
              },
            ])
          }
        >
          Add band
        </Button>
      ) : null}
    </div>
  );
}

function roundIn(n: number): number {
  return Math.round(n * 100) / 100;
}

function TemplatePicker({
  flow,
  locale,
  size,
  templateId,
  disabled,
  onSize,
  onTemplate,
}: {
  flow: RuleFlow;
  locale: Locale;
  size: SizeOrLength;
  templateId: string;
  disabled: boolean;
  onSize: (s: SizeOrLength) => void;
  onTemplate: (id: string) => void;
}) {
  const sizes = flow === "mbolster" ? BOLSTER_LENGTHS : PILLOW_SIZES;
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const kind = flow === "mbolster" ? "bolster" : "pillow";
    const pillowKind =
      flow === "premium-mpillow"
        ? "premium"
        : flow === "basic-mpillow"
          ? "basic"
          : undefined;
    const qs = new URLSearchParams({
      kind,
      key: size,
      role: "filling",
      activeOnly: "true",
    });
    if (pillowKind) qs.set("pillowKind", pillowKind);
    const url = withLocale(
      `/settings/inventory/configure/templates?${qs}`,
      locale,
    );
    void fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const rows = (data.templates ?? data.items ?? []) as {
          id: number | string;
          name: string;
        }[];
        setOptions(rows.map((t) => ({ id: String(t.id), name: t.name })));
      })
      .catch(() => setOptions([]));
  }, [flow, size, locale]);

  return (
    <div className="space-y-2">
      <Label className="text-[10px]">Size scope</Label>
      <select
        disabled={disabled}
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        value={size}
        onChange={(e) => onSize(e.target.value as SizeOrLength)}
      >
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Label className="text-[10px]">Filling Template</Label>
      <select
        disabled={disabled}
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        value={templateId}
        onChange={(e) => onTemplate(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {templateId && !options.some((o) => o.id === templateId) ? (
        <Input
          disabled={disabled}
          className="h-8"
          value={templateId}
          onChange={(e) => onTemplate(e.target.value)}
          aria-label="Template id"
        />
      ) : null}
    </div>
  );
}
