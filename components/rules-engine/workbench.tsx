"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { Loader2, Play, Plus, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { useIsMobile } from "@/hooks/use-mobile";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { useDockActions, type DockAction } from "@/components/ui/app-dock-actions";
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
import {
  catalogDef,
  inputCatalog,
  simulationInputs,
} from "@/lib/rules-engine/catalog";
import { evaluate } from "@/lib/rules-engine/evaluate";
import { FLOW_LABELS, FLOW_OPTIONS } from "@/lib/rules-engine/flow-labels";
import {
  graphToRf,
  newNodeId,
  rfToGraph,
  withOverlay,
  type RuleNodeData,
} from "@/lib/rules-engine/graph-rf";
import { layoutRuleGraph } from "@/lib/rules-engine/layout";
import { canConnect, sourcePort, targetPort } from "@/lib/rules-engine/ports";
import {
  BOLSTER_LENGTHS,
  PILLOW_SIZES,
  RULE_FLOWS,
  type EngineInputs,
  type InputDef,
  type RangeBand,
  type RuleFlow,
  type RuleGraphJson,
  type RuleGraphRow,
  type RuleGraphSummary,
  type RuleNode,
  type SizeOrLength,
  type ValidationError,
} from "@/lib/rules-engine/types";
import { cmToInches, inchesToCm, roundCm } from "@/lib/rules-engine/units";
import { validateForPublish } from "@/lib/rules-engine/validate";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getApiErrorMessage } from "@/lib/utils";
import { TemplateNamesContext, makeNodeTypes } from "./rule-nodes";

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

const PANEL_TITLES = { add: "Add node", node: "Node", simulate: "Simulate" } as const;

const NODE_TYPE_LABELS = Object.fromEntries(
  PALETTE_GROUPS.flatMap((g) => g.items.map((i) => [i.type, i.label])),
) as Record<RuleNode["type"], string>;

type Simulation = {
  /** simulationKey() at run time — a mismatch means the result is out of date. */
  key: string;
  result: ReturnType<typeof evaluate>;
};

// ponytail: re-stringifies on every node change (drag frames too); fine at tens of
// nodes, swap for a revision counter bumped by rule/edge edits if graphs get huge.
function simulationKey(inputs: EngineInputs, nodes: Node<RuleNodeData>[], edges: Edge[]) {
  return JSON.stringify([
    inputs,
    nodes.map((n) => n.data.rule),
    edges.map((e) => [e.source, e.target, e.sourceHandle ?? null]),
  ]);
}

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
  const router = useRouter();
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((p: string) => withLocale(p, locale), [locale]);
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";
  const { fitView, screenToFlowPosition } = useReactFlow();
  useSettingsBreadcrumbDetail(FLOW_LABELS[flow]);
  const isMobile = useIsMobile();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RuleNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Dock tool card popped up above the Admin Panel dock; null = canvas only.
  const [panel, setPanel] = useState<keyof typeof PANEL_TITLES | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dropPosRef = useRef<XYPosition>({ x: 120, y: 120 });

  const [readOnly, setReadOnly] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<RuleGraphRow | null>(null);
  const [versions, setVersions] = useState<RuleGraphSummary[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<ValidationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [testInputs, setTestInputs] = useState<EngineInputs>({});
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const draftGraphRef = useRef<RuleGraphJson>({ nodes: [], edges: [] });
  const skipAutosave = useRef(true);
  const nodeTypes = useMemo(() => makeNodeTypes(flow), [flow]);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});

  // Filling Templates are listed per size, so load every size in the flow once.
  // Inactive ones are included so a node pointing at one still shows its name.
  useEffect(() => {
    const kind = flow === "mbolster" ? "bolster" : "pillow";
    const sizes = flow === "mbolster" ? BOLSTER_LENGTHS : PILLOW_SIZES;
    let cancelled = false;
    void Promise.all(
      sizes.map((key) =>
        fetch(
          withLocale(
            `/settings/inventory/configure/templates?${new URLSearchParams({ kind, key, role: "filling" })}`,
            locale,
          ),
        )
          .then((r) => r.json())
          .then((d) => (d.templates ?? []) as { id: number; name: string }[])
          .catch(() => []),
      ),
    ).then((lists) => {
      if (cancelled) return;
      setTemplateNames(
        Object.fromEntries(lists.flat().map((t) => [String(t.id), t.name])),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [flow, locale]);

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
      setSimulation(null);
      // Seed Simulate with catalog defaults (numeric empty / first enum)
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

  // The Simulate path is derived, not written into nodes: it goes stale the
  // moment inputs or the graph change, and simulating never touches the draft.
  const simKey = useMemo(
    () => simulationKey(testInputs, nodes, edges),
    [testInputs, nodes, edges],
  );
  const simFresh = simulation?.key === simKey;
  const firedIds = useMemo(
    () =>
      new Set(
        simFresh && simulation && !("error" in simulation.result)
          ? simulation.result.trace.map((t) => t.nodeId)
          : [],
      ),
    [simFresh, simulation],
  );
  const view = useMemo(
    () => withOverlay(nodes, edges, publishErrors, firedIds),
    [nodes, edges, publishErrors, firedIds],
  );

  const simStale = !!simulation && !simFresh;
  const dockTools = useMemo<DockAction[]>(() => {
    const toggle = (id: keyof typeof PANEL_TITLES) => () =>
      setPanel((p) => (p === id ? null : id));
    return [
      { id: "add", title: "Add node", icon: Plus, onClick: toggle("add"), active: panel === "add" },
      { id: "node", title: "Node", icon: SlidersHorizontal, onClick: toggle("node"), active: panel === "node" },
      { id: "simulate", title: "Simulate", icon: Play, onClick: toggle("simulate"), active: panel === "simulate", badge: simStale },
    ];
  }, [panel, simStale]);
  useDockActions("/settings/product-builder/rules-engine", dockTools);

  // Autosave draft (debounced)
  useEffect(() => {
    if (readOnly || loading) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    const t = setTimeout(async () => {
      // Serialise inside the timer so a burst of node/edge changes costs one
      // rfToGraph() per debounce window rather than one per change.
      const graph = currentGraph();
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

  const handleSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node<RuleNodeData>[] }) => {
      const id = sel[0]?.id ?? null;
      setSelectedId(id);
      // Selecting opens the Node panel; clearing the selection closes it so an
      // empty editor never sits on the canvas. Simulate stays open until closed.
      if (id) setPanel("node");
      else setPanel((p) => (p === "node" ? null : p));
    },
    [],
  );

  const handleNodeContextMenu = useCallback(
    (_e: React.MouseEvent, node: Node<RuleNodeData>) => setSelectedId(node.id),
    [],
  );

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
      const box = canvasRef.current?.getBoundingClientRect();
      const position =
        at ??
        (box
          ? screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 3 })
          : { x: 80, y: 80 });
      // Selected, so onSelectionChange opens the Node card for the new node.
      setNodes((ns) => [
        ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
        { id: rule.id, type, position, data: { rule }, selected: true },
      ]);
    },
    [flow, readOnly, screenToFlowPosition, setNodes],
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
      ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
      {
        id: rule.id,
        type: rule.type,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data: { rule },
        selected: true,
      },
    ]);
  }, [nodes, readOnly, selectedId, setNodes]);

  const goToFlow = (next: RuleFlow) => {
    if (next === flow) return;
    // Client navigation keeps the app shell (and the dock's tools) mounted.
    router.push(to(`/settings/product-builder/rules-engine/${next}`));
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
      toast.error(getApiErrorMessage(data.error, "Publish failed"));
      return;
    }
    setPublishErrors([]);
    toast.success(`Published v${data.published.version}`);
    await loadDraft();
  };

  const viewVersion = async (v: RuleGraphSummary | null) => {
    if (!v) {
      const rf = graphToRf(draftGraphRef.current);
      setNodes(rf.nodes);
      setEdges(rf.edges);
      setViewingVersion(null);
      setReadOnly(false);
      return;
    }
    // The version list carries metadata only; fetch this version's graph.
    const res = await fetch(`${apiBase(flow)}/versions/${v.id}`);
    const data = await res.json();
    if (!res.ok || !data.ok || !data.version) {
      toast.error(getApiErrorMessage(data.error, "Could not load version"));
      return;
    }
    const full = data.version as RuleGraphRow;
    const rf = graphToRf(full.graph);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setViewingVersion(full);
    setReadOnly(true);
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

  const simulate = (e: React.FormEvent) => {
    e.preventDefault();
    const graph = currentGraph();
    const inputs = simulationInputs(flow, testInputs);
    setSimulation({ key: simKey, result: evaluate(flow, graph, inputs) });
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
                  if (id === "draft") void viewVersion(null);
                  else void viewVersion(versions.find((x) => x.id === id) ?? null);
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

      <div className="flex min-h-0 flex-1 border-t bg-muted/30">
        {/* Canvas + right-click menu */}
        <div ref={canvasRef} className="relative min-h-0 min-w-0 flex-1 max-md:min-h-[60dvh]">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="h-full w-full"
              onContextMenu={(e) => captureDropPos(e.clientX, e.clientY)}
            >
              <TemplateNamesContext.Provider value={templateNames}>
              <ReactFlow
                className="rules-engine-flow"
                colorMode={colorMode}
                nodes={view.nodes}
                edges={view.edges}
                onNodesChange={readOnly ? undefined : onNodesChange}
                onEdgesChange={readOnly ? undefined : onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                nodeTypes={nodeTypes}
                onSelectionChange={handleSelectionChange}
                onNodeContextMenu={handleNodeContextMenu}
                fitView
                proOptions={{ hideAttribution: true }}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                elementsSelectable
              >
                <Background />
                {/* Phones: the dock owns the bottom edge, so controls move up and the minimap goes */}
                <Controls
                  position={isMobile ? "top-left" : "bottom-left"}
                  orientation={isMobile ? "horizontal" : "vertical"}
                />
                {isMobile ? null : <MiniMap pannable zoomable />}
              </ReactFlow>
              </TemplateNamesContext.Provider>
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

        {/* Dock tool card: pops up just above the dock it was opened from. Phones get
            a full-width sheet; md+ a centred card. Both clear the measured dock. */}
        {panel ? (
          <section
            aria-label={PANEL_TITLES[panel]}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPanel(null);
            }}
            className="fixed inset-x-2 bottom-[calc(var(--mobile-dock-height)+var(--mobile-dock-offset)+var(--safe-bottom)+0.75rem)] z-40 flex max-h-[60dvh] flex-col overflow-hidden rounded-xl border bg-background text-sm shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150 md:inset-x-auto md:left-1/2 md:max-h-[min(36rem,calc(100dvh-12rem))] md:w-[22rem] md:-translate-x-1/2"
          >
            <div className="flex shrink-0 items-center justify-between border-b py-1.5 pl-3 pr-1.5">
              <span className="text-xs font-medium">
                {panel === "node" && selected
                  ? `Node · ${NODE_TYPE_LABELS[selected.data.rule.type]}`
                  : PANEL_TITLES[panel]}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {panel === "add" ? (
              <div className="min-h-0 space-y-3 overflow-y-auto p-3">
                {PALETTE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map((p) => (
                        <button
                          key={p.type}
                          type="button"
                          disabled={readOnly}
                          onClick={() => addNode(p.type)}
                          className="flex flex-col items-start gap-0.5 rounded-md border bg-card px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                        >
                          <span className="text-xs font-medium">{p.label}</span>
                          <span className="text-[10px] leading-snug text-muted-foreground">{p.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : panel === "node" ? (
              <div className="min-h-0 overflow-y-auto p-3">
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
                  Select a node on the canvas to edit it.
                </p>
              )}
              </div>
            ) : (
              <form onSubmit={simulate} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                  <p className="text-xs text-muted-foreground">
                    Try sample answers against this graph. Nothing here is saved.
                  </p>
                  {(
                    [
                      ["Measurements · inches", (d: InputDef) => d.valueType === "number"],
                      ["Answers", (d: InputDef) => d.valueType !== "number"],
                    ] as const
                  ).map(([title, keep]) => (
                    <fieldset key={title} className="space-y-2">
                      <legend className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {title}
                      </legend>
                      {inputCatalog(flow)
                        .filter(keep)
                        .map((def) => (
                          <SimulateField
                            key={def.key}
                            def={def}
                            value={testInputs[def.key]}
                            onChange={(v) => setTestInputs((s) => ({ ...s, [def.key]: v }))}
                          />
                        ))}
                    </fieldset>
                  ))}
                </div>

                <div className="shrink-0 space-y-2 border-t p-3">
                  <Button type="submit" size="sm" className="w-full">
                    <Play className="size-3.5" />
                    Simulate
                  </Button>
                  <SimulationResult
                    simulation={simulation}
                    fresh={simFresh}
                    templateNames={templateNames}
                  />
                </div>
              </form>
            )}
          </section>
        ) : null}
        </div>
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

function SimulateField({
  def,
  value,
  onChange,
}: {
  def: InputDef;
  value: EngineInputs[string];
  onChange: (v: EngineInputs[string]) => void;
}) {
  const id = `simulate-${def.key}`;
  const selectClass =
    "h-8 w-full rounded-md border bg-card px-2 text-xs max-md:text-base";
  return (
    <div className="space-y-0.5">
      <Label htmlFor={id} className="text-[11px]">
        {prettyKey(def.key)}
      </Label>
      {def.valueType === "number" ? (
        <div className="relative">
          <Input
            id={id}
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            className="h-8 pr-8"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
            in
          </span>
        </div>
      ) : (
        <select
          id={id}
          className={selectClass}
          value={String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""))}
          onChange={(e) => {
            const v = e.target.value;
            onChange(
              def.valueType === "string[]" ? [v] : def.valueType === "boolean" ? v === "true" : v,
            );
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
  );
}

function SimulationResult({
  simulation,
  fresh,
  templateNames,
}: {
  simulation: Simulation | null;
  fresh: boolean;
  templateNames: Record<string, string>;
}) {
  if (!simulation) {
    return (
      <p className="text-xs text-muted-foreground">
        Simulate to light up the path these answers take.
      </p>
    );
  }
  const r = simulation.result;
  return (
    <div className="space-y-1.5" aria-live="polite">
      {!fresh ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-500">
          Answers or graph changed — simulate again.
        </p>
      ) : null}
      <div className={fresh ? undefined : "opacity-50"}>
        {"error" in r ? (
          <p className="text-xs text-destructive">
            Missing: {r.missing.map(prettyKey).join(", ")}
          </p>
        ) : (
          <>
            {r.firedTerminals.length === 0 ? (
              <p className="mb-1 text-xs text-destructive">No output fired for these answers.</p>
            ) : r.usedFallback ? (
              <p className="mb-1 text-xs text-amber-600 dark:text-amber-500">
                No rule matched — the Fallback answered.
              </p>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-medium">{r.size ?? "—"}</dd>
              <dt className="text-muted-foreground">Template</dt>
              <dd className="font-medium break-all">
                {r.templateId ? (templateNames[r.templateId] ?? r.templateId) : "—"}
              </dd>
              <dt className="text-muted-foreground">Tier</dt>
              <dd className="font-medium">{r.tierSuggestion ?? "—"}</dd>
              <dt className="text-muted-foreground">Flow route</dt>
              <dd className="font-medium">
                {r.flowRoute
                  ? `${FLOW_LABELS[r.flowRoute.targetFlow]}${r.flowRoute.reason ? ` · ${r.flowRoute.reason}` : ""}`
                  : "—"}
              </dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
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
