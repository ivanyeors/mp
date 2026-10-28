"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Group } from "@visx/group";
import { Cluster, hierarchy } from "@visx/hierarchy";
import type { HierarchyPointLink, HierarchyPointNode } from "d3-hierarchy";
import { LinkVertical } from "@visx/shape";

type NodeShape = {
  name: string;
  meta?: {
    kind?: "root" | "category" | "item";
    quantity?: number;
    itemId?: number;
    category?: string;
  };
  children?: NodeShape[];
};

type BomTemplateRow = {
  id: number;
  kind: "pillow" | "bolster";
  key: string;
  name: string;
  pillow_kind?: "basic" | "premium" | null;
  pillow_variant?: "linen" | "fibrecool" | null;
  updated_at?: string;
};

type BomTemplateLineRow = {
  quantity: string | number;
  item: {
    id: number;
    category: string;
    name: string;
    size: string | null;
    subtype: string | null;
  } | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  cover: "Covers",
  pillow_case: "Pillow cases",
  pillow_protector: "Pillow protectors",
  bolster_case: "Bolster cases",
  bolster_protector: "Bolster protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

const CATEGORY_ORDER = [
  "cover",
  "pillow_case",
  "pillow_protector",
  "bolster_case",
  "bolster_protector",
  "filling",
  "packaging",
  "accessories",
  "other",
];

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const humanize = (value: string) =>
  value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function describeItem(item: { name: string; size: string | null; subtype: string | null; category: string }) {
  const base = item.name?.trim() ? item.name.trim() : humanize(item.category);
  if (item.size) return `${base} — ${item.size}`;
  if (item.subtype) return `${base} — ${item.subtype}`;
  return base;
}

function templateLabel(t: BomTemplateRow) {
  if (t.kind === "pillow") {
    const pk = t.pillow_kind ?? "basic";
    const variant = pk === "premium" && t.pillow_variant ? ` · ${t.pillow_variant}` : "";
    return `Pillow · ${pk.toUpperCase()} · ${t.key}${variant} — ${t.name}`;
  }
  return `Bolster · ${t.key} — ${t.name}`;
}

function templateDisplay(t: BomTemplateRow) {
  if (t.kind === "pillow") {
    const pk = (t.pillow_kind ?? "basic").toUpperCase();
    const variant = t.pillow_kind === "premium" && t.pillow_variant ? ` · ${humanize(t.pillow_variant)}` : "";
    return { title: `Pillow · ${pk}${variant} · ${t.key}`, subtitle: t.name };
  }
  return { title: `Bolster · ${t.key}`, subtitle: t.name };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}

function wrapText(
  text: string,
  {
    maxCharsPerLine,
    maxLines,
  }: {
    maxCharsPerLine: number;
    maxLines: number;
  }
): string[] {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [""];

  // Encourage line breaks on separators used in our labels.
  const tokens = normalized
    .replaceAll(" · ", "  ·  ")
    .replaceAll(" — ", "  —  ")
    .split(/\s+/g)
    .filter(Boolean);

  const lines: string[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    const candidate = [...current, token].join(" ").trim();
    if (candidate.length <= maxCharsPerLine || current.length === 0) {
      current.push(token);
      continue;
    }
    lines.push(current.join(" ").trim());
    current = [token];
    if (lines.length >= maxLines - 1) break;
  }
  if (current.length && lines.length < maxLines) {
    lines.push(current.join(" ").trim());
  }

  // If we ran out of lines, append an ellipsis.
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  if (tokens.length && lines.length === maxLines) {
    const consumed = lines.join(" ").replace(/\s+/g, " ").trim();
    const original = tokens.join(" ").replace(/\s+/g, " ").trim();
    if (consumed.length < original.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/g, "").trim()}…`;
    }
  }
  return lines;
}

function RootNode({ node }: { node: HierarchyPointNode<NodeShape> }) {
  const fontSize = 14;
  const lineHeight = 16;
  const paddingX = 14;
  const paddingY = 10;
  const maxCharsPerLine = 38;
  const maxLines = 3;

  const lines = wrapText(node.data.name, { maxCharsPerLine, maxLines });
  const maxLineChars = Math.max(...lines.map((l) => l.length), 10);
  const approxCharWidth = fontSize * 0.56;
  const width = Math.max(220, Math.min(420, Math.round(maxLineChars * approxCharWidth + paddingX * 2)));
  const height = paddingY * 2 + lines.length * lineHeight;

  return (
    <Group top={node.y} left={node.x}>
      <rect
        width={width}
        height={height}
        x={-width / 2}
        y={-height / 2}
        rx={12}
        fill="var(--muted)"
        stroke="var(--border)"
      />
      <text
        fontSize={fontSize}
        textAnchor="middle"
        fill="var(--foreground)"
      >
        {lines.map((line, idx) => (
          <tspan
            key={idx}
            x={0}
            y={-height / 2 + paddingY + lineHeight * (idx + 1) - lineHeight / 3}
          >
            {line}
          </tspan>
        ))}
      </text>
    </Group>
  );
}

function Node({ node }: { node: HierarchyPointNode<NodeShape> }) {
  const isRoot = node.depth === 0;
  if (isRoot) return <RootNode node={node} />;

  const kind = node.data.meta?.kind ?? "item";
  const isCategory = kind === "category";
  const isLeaf = !node.children;

  const radius = isCategory ? 12 : 10;
  const fill = isCategory ? "var(--primary)" : "var(--card)";
  const stroke = isCategory ? "var(--primary)" : "var(--border)";
  const textFill = isCategory ? "var(--primary-foreground)" : "var(--muted-foreground)";

  const rawLabel = node.data.name;
  const [primaryLabel, secondaryFromDash] = rawLabel.split(" — ", 2);
  const qty = node.data.meta?.quantity;
  const secondaryLabel = (() => {
    const extra = secondaryFromDash?.trim();
    const qtyPart = qty ? `×${qty}` : null;
    if (extra && qtyPart) return `${humanize(extra)} • ${qtyPart}`;
    if (extra) return humanize(extra);
    if (qtyPart) return qtyPart;
    return null;
  })();

  return (
    <Group top={node.y} left={node.x}>
      <circle r={radius} fill={fill} stroke={stroke} />
      <title>{rawLabel}</title>
      <text
        dy=".33em"
        fontSize={10}
        textAnchor="middle"
        style={{ pointerEvents: "none" }}
        fill={textFill}
      >
        {isCategory ? node.data.name.slice(0, 2).toUpperCase() : ""}
      </text>
      <text
        x={radius + 10}
        y={isLeaf ? -4 : 5}
        fontSize={13}
        textAnchor="start"
        fill="var(--foreground)"
      >
        {primaryLabel.trim()}
      </text>
      {isLeaf && secondaryLabel && (
        <text
          x={radius + 10}
          y={18}
          fontSize={11}
          textAnchor="start"
          fill="var(--muted-foreground)"
        >
          {secondaryLabel}
        </text>
      )}
    </Group>
  );
}

function DendrogramSvg({
  width,
  height,
  data,
  padding = 64,
  viewportTransform,
  svgRef,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  width: number;
  height: number;
  data: NodeShape;
  padding?: number;
  viewportTransform?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
}) {
  const root = useMemo(() => hierarchy<NodeShape>(data), [data]);
  const innerWidth = Math.max(10, width - padding * 2);
  const innerHeight = Math.max(10, height - padding * 2);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <g transform={viewportTransform}>
        <Cluster<NodeShape> root={root} size={[innerWidth, innerHeight]}>
          {(cluster) => (
            <Group top={padding} left={padding}>
              {cluster.links().map((link, i) => (
                <LinkVertical<HierarchyPointLink<NodeShape>, HierarchyPointNode<NodeShape>>
                  key={`link-${i}`}
                  data={link}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  strokeOpacity={0.35}
                  fill="none"
                />
              ))}
              {cluster.descendants().map((node, i) => (
                <Node key={`node-${i}`} node={node} />
              ))}
            </Group>
          )}
        </Cluster>
      </g>
    </svg>
  );
}

export function ProductConfigurationCard() {
  const [templates, setTemplates] = useState<BomTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [tree, setTree] = useState<NodeShape | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [view, setView] = useState<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startViewX: number; startViewY: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingTemplates(true);
      setError(null);
      try {
        const { data, error: err } = await supabaseClient
          .from("bom_templates")
          .select("id,kind,key,name,pillow_kind,pillow_variant,updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        if (err) throw new Error(err.message);
        const rows = (data ?? []) as unknown as BomTemplateRow[];
        if (cancelled) return;
        setTemplates(rows);
        setSelectedTemplateId((prev) => prev ?? (rows[0]?.id ?? null));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load templates");
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!selectedTemplateId) {
        setTree(null);
        return;
      }
      setLoadingTree(true);
      setError(null);
      try {
        const template = templates.find((t) => t.id === selectedTemplateId) ?? null;
        const { data, error: err } = await supabaseClient
          .from("bom_template_lines")
          .select("quantity,item:items(id,category,name,size,subtype)")
          .eq("template_id", selectedTemplateId);
        if (err) throw new Error(err.message);
        const lines = (data ?? []) as unknown as BomTemplateLineRow[];

        const byCategory = new Map<string, Array<{ id: number; label: string; qty: number }>>();
        for (const row of lines) {
          const item = row.item;
          if (!item) continue;
          const qty = Math.max(0, toNumber(row.quantity) ?? 0);
          const category = String(item.category || "other");
          const label = describeItem(item);
          const arr = byCategory.get(category) ?? [];
          arr.push({ id: item.id, label, qty });
          byCategory.set(category, arr);
        }

        const categories = Array.from(byCategory.entries())
          .sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a[0]);
            const bi = CATEGORY_ORDER.indexOf(b[0]);
            if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          })
          .map(([category, items]) => ({
            name: CATEGORY_LABELS[category] ?? humanize(category),
            meta: { kind: "category" as const, category },
            children: items
              .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label))
              .map((it) => ({
                name: it.label,
                meta: { kind: "item" as const, itemId: it.id, quantity: it.qty, category },
              })),
          }));

        const rootName = template ? templateLabel(template) : `Template ${selectedTemplateId}`;
        const nextTree: NodeShape = {
          name: rootName,
          meta: { kind: "root" },
          children: categories.length ? categories : [{ name: "No BOM lines yet", meta: { kind: "category" } }],
        };
        if (cancelled) return;
        setTree(nextTree);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load BOM");
        setTree(null);
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId, templates]);

  const selectedLabel = useMemo(() => {
    const t = selectedTemplateId ? templates.find((x) => x.id === selectedTemplateId) : null;
    return t ? templateLabel(t) : null;
  }, [selectedTemplateId, templates]);

  const selectedTemplate = useMemo(() => {
    return selectedTemplateId ? templates.find((x) => x.id === selectedTemplateId) ?? null : null;
  }, [selectedTemplateId, templates]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getSvgPointFromEvent = (event: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const zoomAt = (nextScale: number, anchor: { x: number; y: number }) => {
    setView((prev) => {
      const scale = clamp(nextScale, 0.35, 4);
      const worldX = (anchor.x - prev.x) / prev.scale;
      const worldY = (anchor.y - prev.y) / prev.scale;
      const x = anchor.x - worldX * scale;
      const y = anchor.y - worldY * scale;
      return { x, y, scale };
    });
  };

  const onWheel: React.WheelEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    const p = getSvgPointFromEvent(e);
    if (!p) return;
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.12 : 1 / 1.12;
    zoomAt(view.scale * factor, p);
  };

  const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const el = svgRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startViewX: view.x, startViewY: view.y };
  };

  const onPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setView((prev) => ({ ...prev, x: drag.startViewX + dx, y: drag.startViewY + dy }));
  };

  const onPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const el = svgRef.current;
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
  };

  const viewportTransform = `translate(${view.x} ${view.y}) scale(${view.scale})`;
  const dendrogramPadding = width < 480 ? 36 : 64;

  const treeReady =
    !loadingTemplates && templates.length > 0 && !loadingTree && !!tree && width >= 10 && height >= 10;

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
        <CardTitle>Product Configuration</CardTitle>
        <CardAction>
          <Select
            value={selectedTemplateId ? String(selectedTemplateId) : undefined}
            onValueChange={(v) => setSelectedTemplateId(v ? Number(v) : null)}
          >
            <SelectTrigger className="h-auto w-full max-w-full py-2 sm:w-auto sm:max-w-[520px]">
              {selectedTemplate ? (
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">Template</div>
                  <div className="truncate text-sm font-medium">{templateDisplay(selectedTemplate).title}</div>
                  <div className="truncate text-xs text-muted-foreground">{templateDisplay(selectedTemplate).subtitle}</div>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">Template</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {loadingTemplates ? "Loading…" : "Select a template"}
                  </div>
                </div>
              )}
            </SelectTrigger>
            <SelectContent align="end" side="bottom">
              {(() => {
                const pillows = templates.filter((t) => t.kind === "pillow");
                const bolsters = templates.filter((t) => t.kind === "bolster");
                const renderGroup = (title: string, items: BomTemplateRow[]) => (
                  <div key={title}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{title}</div>
                    {items.map((t) => {
                      const d = templateDisplay(t);
                      return (
                        <SelectItem key={t.id} value={String(t.id)} textValue={templateLabel(t)} className="py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{d.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{d.subtitle}</div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </div>
                );
                return (
                  <>
                    {pillows.length ? renderGroup("Pillows", pillows) : null}
                    {pillows.length && bolsters.length ? <div className="my-1 h-px bg-border" /> : null}
                    {bolsters.length ? renderGroup("Bolsters", bolsters) : null}
                  </>
                );
              })()}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3 px-4 sm:px-6">
        {error && <div className="text-sm text-destructive">{error}</div>}

        {/* Phones: the zoom controls sit under the drawing, not over its node labels.
            From md they float in its corner as before. */}
        <div className="relative">
          <div ref={ref} className="relative h-[520px] w-full overflow-hidden rounded-xl border bg-card">
            {loadingTemplates ? (
              <div className="p-3 sm:p-4">
                <Skeleton className="h-[28px] w-[260px] rounded-lg" />
                <Skeleton className="mt-4 h-[440px] w-full rounded-xl" />
              </div>
            ) : templates.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground sm:p-6">
                No BOM templates found yet. Create one in Settings → Inventory → Configure → Templates.
              </div>
            ) : loadingTree ? (
              <div className="p-3 sm:p-4">
                <Skeleton className="h-[28px] w-[380px] rounded-lg" />
                <Skeleton className="mt-4 h-[440px] w-full rounded-xl" />
              </div>
            ) : !treeReady || !tree ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground sm:p-6">
                {selectedLabel ? "No parts found for this template." : "Select a template."}
              </div>
            ) : (
              <DendrogramSvg
                width={Math.max(10, width)}
                height={Math.max(10, height)}
                data={tree}
                padding={dendrogramPadding}
                svgRef={svgRef}
                viewportTransform={viewportTransform}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            )}
          </div>

          {treeReady ? (
            <div className="mt-2 flex items-center justify-end gap-2 md:absolute md:bottom-3 md:right-3 md:mt-0 md:rounded-lg md:border md:bg-background/80 md:p-1 md:backdrop-blur">
              <Button
                type="button"
                variant="outline"
                aria-label="Zoom in"
                className="h-7 px-2 max-md:min-w-11 sm:h-8"
                onClick={() => zoomAt(view.scale * 1.15, { x: width / 2, y: height / 2 })}
              >
                +
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label="Zoom out"
                className="h-7 px-2 max-md:min-w-11 sm:h-8"
                onClick={() => zoomAt(view.scale / 1.15, { x: width / 2, y: height / 2 })}
              >
                −
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-7 px-2 sm:h-8"
                onClick={() => setView({ x: 0, y: 0, scale: 1 })}
              >
                Reset
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

