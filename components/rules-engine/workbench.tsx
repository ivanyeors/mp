"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workbench.css";
import { Loader2, PanelLeftClose, PanelRightClose, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { layoutRuleGraph } from "@/lib/rules-engine/layout";
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

const PALETTE_GROUPS: {
  label: string;
  items: { type: RuleNode["type"]; label: string; hint: string }[];
}[] = [
  {
    label: "Logic",
    items: [
      { type: "input", label: "Input", hint: "Read a measurement or answer" },
      { type: "range", label: "Range", hint: "Band a numeric input" },
      { type: "match", label: "Match", hint: "Branch on an enum" },
      { type: "combine", label: "Combine", hint: "AND / join signals" },
    ],
  },
  {
    label: "Outputs",
    items: [
      { type: "size-output", label: "Size", hint: "Emit a size / length" },
      { type: "template-output", label: "Template", hint: "Size + template id" },
      { type: "tier-suggestion", label: "Tier", hint: "Premium / Basic cue" },
      { type: "fallback", label: "Fallback", hint: "Default when nothing fires" },
    ],
  },
  {
    label: "Routing",
    items: [
      { type: "flow-route", label: "Flow route", hint: "Upsell / cross-flow" },
    ],
  },
];

const PALETTE_DOCK_KEY = "rules-engine-palette-dock";

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
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";
  const { fitView, screenToFlowPosition } = useReactFlow();
  useSettingsBreadcrumbDetail(FLOW_LABELS[flow]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RuleNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // max-md only: inspector is a collapsible drawer; desktop keeps it docked.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [paletteDocked, setPaletteDocked] = useState(false);
  const dropPosRef = useRef<XYPosition>({ x: 120, y: 120 });

  useEffect(() => {
    try {
      setPaletteDocked(localStorage.getItem(PALETTE_DOCK_KEY) === "1");
    } catch {
      /* ponytail: private mode / blocked storage */
    }
  }, []);

  const setDocked = (next: boolean) => {
    setPaletteDocked(next);
    try {
      localStorage.setItem(PALETTE_DOCK_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const [readOnly, setReadOnly] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<RuleGraphRow | null>(null);
  const [versions, setVersions] = useState<RuleGraphRow[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const msg = getApiErrorMessage(data.error, `Autosave failed (HTTP ${res.status})`);
          setSaveState("error");
          setSaveError(msg);
          toast.error(msg);
          return;
        }
        draftGraphRef.current = graph;
        setSaveError(null);
        setSaveState("saved");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error — draft not saved";
        setSaveState("error");
        setSaveError(msg);
        toast.error(`Autosave failed: ${msg}`);
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

  const addNode = useCallback(
    (type: RuleNode["type"], at?: XYPosition) => {
      if (readOnly) return;
      const rule = defaultRule(type, flow);
      const position =
        at ??
        ({
          x: 80 + nodes.length * 24,
          y: 80 + nodes.length * 16,
        } satisfies XYPosition);
      setNodes((ns) => [
        ...ns,
        { id: rule.id, type, position, data: { rule } },
      ]);
      setSelectedId(rule.id);
    },
    [flow, nodes.length, readOnly, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (readOnly || !selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) =>
      es.filter((e) => e.source !== selectedId && e.target !== selectedId),
    );
    setSelectedId(null);
  }, [readOnly, selectedId, setEdges, setNodes]);

  const duplicateSelected = useCallback(() => {
    if (readOnly || !selectedId) return;
    const src = nodes.find((n) => n.id === selectedId);
    if (!src) return;
    const rule = structuredClone(src.data.rule);
    rule.id = newNodeId(rule.type);
    setNodes((ns) => [
      ...ns,
      {
        id: rule.id,
        type: rule.type,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data: { rule },
      },
    ]);
    setSelectedId(rule.id);
  }, [nodes, readOnly, selectedId, setNodes]);

  const goToFlow = (next: RuleFlow) => {
    if (next === flow) return;
    window.location.href = to(`/settings/product-builder/rules-engine/${next}`);
  };

  const captureDropPos = (clientX: number, clientY: number) => {
    dropPosRef.current = screenToFlowPosition({ x: clientX, y: clientY });
  };

  const rearrange = useCallback(() => {
    if (readOnly || nodes.length === 0) return;
    const pos = layoutRuleGraph(
      nodes.map((n) => n.id),
      edges.map((e) => ({ source: e.source, target: e.target })),
    );
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        position: pos.get(n.id) ?? n.position,
      })),
    );
    requestAnimationFrame(() => void fitView({ padding: 0.2 }));
  }, [edges, fitView, nodes, readOnly, setNodes]);

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

  const saveLabel = readOnly
    ? `Read-only · v${viewingVersion?.version}`
    : saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Draft saved"
        : saveState === "error"
          ? "Save error"
          : "Draft";
  const saveTitle = saveState === "error" ? saveError ?? "Save failed — see the notification for details" : undefined;

  return (
    <div className="rules-engine-workbench -mx-2 -my-4 flex h-[calc(100svh-3.5rem)] flex-col sm:-mx-3 md:-mx-6 md:-my-8 lg:-mx-8 lg:-my-10">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-3 sm:px-3 md:px-6 lg:px-8">
        {/* ponytail: mp-care Menubar pattern for product / palette / version */}
        <Menubar className="border-none shadow-none">
          <MenubarMenu>
            <MenubarTrigger aria-label="Product flow">
              {FLOW_LABELS[flow]}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarLabel>Product</MenubarLabel>
              <MenubarRadioGroup
                value={flow}
                onValueChange={(v) => goToFlow(v as RuleFlow)}
              >
                {FLOW_OPTIONS.map((o) => (
                  <MenubarRadioItem key={o.id} value={o.id}>
                    {o.label}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>Palette</MenubarTrigger>
            <MenubarContent className="min-w-56">
              <MenubarCheckboxItem
                checked={paletteDocked}
                onCheckedChange={(v) => setDocked(v === true)}
              >
                Dock palette
              </MenubarCheckboxItem>
              <MenubarSeparator />
              {PALETTE_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 ? <MenubarSeparator /> : null}
                  <MenubarLabel>{group.label}</MenubarLabel>
                  {group.items.map((p) => (
                    <MenubarItem
                      key={p.type}
                      disabled={readOnly}
                      onClick={() => addNode(p.type)}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span>{p.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {p.hint}
                        </span>
                      </span>
                    </MenubarItem>
                  ))}
                </div>
              ))}
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>
              {viewingVersion ? `v${viewingVersion.version}` : "Draft"}
            </MenubarTrigger>
            <MenubarContent className="min-w-48">
              <MenubarLabel>Version</MenubarLabel>
              <MenubarRadioGroup
                value={viewingVersion?.id ?? "draft"}
                onValueChange={(id) => {
                  if (id === "draft") viewVersion(null);
                  else viewVersion(versions.find((x) => x.id === id) ?? null);
                }}
              >
                <MenubarRadioItem value="draft">Draft</MenubarRadioItem>
                {versions.map((v) => (
                  <MenubarRadioItem key={v.id} value={v.id}>
                    v{v.version}
                    {v.published_at ? ` · ${v.published_at.slice(0, 10)}` : ""}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
              {viewingVersion ? (
                <>
                  <MenubarSeparator />
                  <MenubarItem onClick={() => void restore(viewingVersion.id)}>
                    Restore to draft
                  </MenubarItem>
                </>
              ) : null}
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>Graph</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!!viewingVersion}
                onClick={() => void publish()}
              >
                Publish
                <MenubarShortcut>⌘P</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => void fitView({ padding: 0.2 })}>
                Fit view
              </MenubarItem>
              <MenubarItem
                disabled={readOnly || nodes.length === 0}
                onClick={rearrange}
              >
                Rearrange
              </MenubarItem>
              <MenubarItem
                disabled={readOnly || !selectedId}
                onClick={duplicateSelected}
              >
                Duplicate selected
              </MenubarItem>
              <MenubarItem
                disabled={readOnly || !selectedId}
                onClick={deleteSelected}
              >
                Delete selected
                <MenubarShortcut>⌫</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <span
          className={`text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}
          title={saveTitle}
        >
          {saveLabel}
        </span>
        <div className="flex-1" />
        {/* max-md: toggle the inspector drawer (hidden on desktop, always docked there) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden max-md:inline-flex"
          aria-pressed={inspectorOpen}
          onClick={() => setInspectorOpen((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          Inspector
        </Button>
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void publish()}
          >
            Publish
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-0 border-t bg-muted/30 max-md:flex-col">
        {/* Docked palette — off by default; toggle from Palette → Dock palette */}
        {paletteDocked ? (
          <aside className="flex w-52 shrink-0 flex-col border-r bg-background max-md:w-full max-md:max-h-40 max-md:border-r-0 max-md:border-b">
            <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Palette
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 cursor-pointer"
                title="Undock palette"
                onClick={() => setDocked(false)}
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 px-2 py-2 pb-3">
                {PALETTE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1">
                    <div className="px-0.5 text-[10px] font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.items.map((p) => (
                      <Button
                        key={p.type}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={readOnly}
                        title={p.hint}
                        onClick={() => addNode(p.type)}
                        className="h-auto w-full cursor-pointer justify-start px-2 py-1.5 text-left font-normal"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs font-medium">{p.label}</span>
                          <span className="text-[10px] leading-snug text-muted-foreground whitespace-normal">
                            {p.hint}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>
        ) : null}

        {/* Canvas + right-click menu */}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="min-h-0 min-w-0 flex-1 max-md:min-h-[60dvh]"
              onContextMenu={(e) => captureDropPos(e.clientX, e.clientY)}
            >
              <ReactFlow
                className="rules-engine-flow"
                colorMode={colorMode}
                nodes={nodes}
                edges={edges}
                onNodesChange={readOnly ? undefined : onNodesChange}
                onEdgesChange={readOnly ? undefined : onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                nodeTypes={nodeTypes}
                onSelectionChange={({ nodes: sel }) => {
                  const id = sel[0]?.id ?? null;
                  setSelectedId(id);
                  if (id) setInspectorOpen(true); // max-md: reveal drawer on select
                }}
                onNodeContextMenu={(_e, node) => setSelectedId(node.id)}
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
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-48">
            <ContextMenuLabel>Canvas</ContextMenuLabel>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={readOnly}>
                Add node
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-44">
                {PALETTE_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 ? <ContextMenuSeparator /> : null}
                    <ContextMenuLabel>{group.label}</ContextMenuLabel>
                    {group.items.map((p) => (
                      <ContextMenuItem
                        key={p.type}
                        disabled={readOnly}
                        onClick={() => addNode(p.type, dropPosRef.current)}
                      >
                        {p.label}
                      </ContextMenuItem>
                    ))}
                  </div>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onClick={() => void fitView({ padding: 0.2 })}>
              Fit view
            </ContextMenuItem>
            <ContextMenuItem
              disabled={readOnly || nodes.length === 0}
              onClick={rearrange}
            >
              Rearrange
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={readOnly || !selectedId}
              onClick={duplicateSelected}
            >
              Duplicate selected
            </ContextMenuItem>
            <ContextMenuItem
              disabled={readOnly || !selectedId}
              variant="destructive"
              onClick={deleteSelected}
            >
              Delete selected
            </ContextMenuItem>
            {!viewingVersion ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => void publish()}>
                  Publish draft
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>

        {/* Editor + test — desktop: docked column; max-md: collapsible bottom drawer */}
        <aside
          className={`flex w-72 shrink-0 flex-col overflow-hidden border-l text-sm max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:h-[70dvh] max-md:w-full max-md:border-l-0 max-md:border-t max-md:bg-background max-md:shadow-2xl ${inspectorOpen ? "" : "max-md:hidden"}`}
        >
          <div className="hidden shrink-0 items-center justify-between border-b px-3 py-2 max-md:flex">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Inspector
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <PanelRightClose className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
                  Select a node to edit.
                </p>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">
                Test panel
              </div>
              <div className="space-y-2">
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
                          setTestInputs((s) => ({
                            ...s,
                            [def.key]: e.target.value,
                          }))
                        }
                      />
                    ) : def.valueType === "string[]" ? (
                      <select
                        className="h-8 w-full rounded-md border bg-card px-2 text-xs max-md:text-base"
                        value={String(
                          Array.isArray(testInputs[def.key])
                            ? (testInputs[def.key] as string[])[0]
                            : "",
                        )}
                        onChange={(e) =>
                          setTestInputs((s) => ({
                            ...s,
                            [def.key]: [e.target.value],
                          }))
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
                        className="h-8 w-full rounded-md border bg-card px-2 text-xs max-md:text-base"
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2 w-full"
              onClick={runTest}
            >
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
        <Label className="text-[10px]">
          {rule.type === "range" ? "Measurement" : "Input key"}
        </Label>
        <select
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
          value={rule.inputKey}
          onChange={(e) => onChange({ ...rule, inputKey: e.target.value })}
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {prettyKey(k)}
            </option>
          ))}
        </select>
        {rule.type === "range" ? (
          <BandsEditor
            bands={rule.bands}
            measurementLabel={prettyKey(rule.inputKey)}
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
          className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
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
          className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
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
          className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
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
  measurementLabel,
  disabled,
  onChange,
}: {
  bands: RangeBand[];
  measurementLabel: string;
  disabled: boolean;
  onChange: (bands: RangeBand[]) => void;
}) {
  const setBand = (i: number, patch: Partial<RangeBand>) => {
    const next = bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium">Size bands · inches</div>
      <p className="text-[10px] text-muted-foreground">
        Each band maps a {measurementLabel} range to a size.
      </p>
      {bands.length ? (
        <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-1 px-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Min</span>
          <span>Max</span>
          <span>Label</span>
          {!disabled ? <span className="w-7" /> : null}
        </div>
      ) : null}
      {bands.map((b, i) => (
        <div
          key={b.id}
          className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-1"
        >
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
          {!disabled ? (
            <button
              type="button"
              aria-label={`Remove ${b.label || "band"}`}
              onClick={() => onChange(bands.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-destructive inline-flex h-7 w-7 items-center justify-center rounded-md"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
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
          + Add band
        </Button>
      ) : null}
    </div>
  );
}

function roundIn(n: number): number {
  return Math.round(n * 100) / 100;
}

// Humanize catalog keys for display: shoulder_length_cm -> "Shoulder length".
// Check: prettyKey("shoulder_length_cm") === "Shoulder length".
function prettyKey(key: string): string {
  const s = key.replace(/_cm$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
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
        className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
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
        className="h-8 w-full rounded-md border bg-background px-2 text-xs max-md:text-base"
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
