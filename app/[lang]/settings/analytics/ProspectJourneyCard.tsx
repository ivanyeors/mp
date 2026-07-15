"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { edgeStrokeWidth } from "@/lib/analytics/journey/chrome";
import {
  getProspectJourneyTransitions,
  type JourneyNodeDetail,
  type JourneySectionNode,
  type JourneyTransitionEdge,
  type JourneyTransitionNode,
} from "./actions";

type Props = { from: string; to: string };

const ALL = "__all__";
const DROP_OFF = "__drop_off__";

function labelPath(path: string) {
  if (path === DROP_OFF) return "Drop-off";
  const hash = path.indexOf("#");
  if (hash >= 0) return `${path.slice(0, hash)} › ${path.slice(hash + 1)}`;
  return path === "/" ? "Home" : path;
}

function formatDwell(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatGap(ms: number) {
  if (ms < 60_000) return formatDwell(ms);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

type LayoutNode = JourneyTransitionNode & { x: number; y: number };

function layoutGraph(
  nodes: JourneyTransitionNode[],
  width: number,
  height: number,
): LayoutNode[] {
  const sink = nodes.find((n) => n.path === DROP_OFF);
  const pages = nodes.filter((n) => n.path !== DROP_OFF);
  const cx = width * 0.42;
  const cy = height * 0.5;
  const r = Math.min(width, height) * 0.32;
  const laid: LayoutNode[] = pages.map((n, i) => {
    const angle = pages.length === 1 ? -Math.PI / 2 : (i / pages.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  if (sink) {
    laid.push({ ...sink, x: width * 0.88, y: cy });
  }
  return laid;
}

function JourneyGraph({
  nodes,
  edges,
  selectedPath,
  onSelect,
  colorByCode,
}: {
  nodes: JourneyTransitionNode[];
  edges: JourneyTransitionEdge[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  colorByCode: Map<string, string>;
}) {
  const width = 640;
  const height = 320;
  const laid = useMemo(() => layoutGraph(nodes, width, height), [nodes]);
  const byPath = useMemo(() => new Map(laid.map((n) => [n.path, n])), [laid]);
  const maxCount = Math.max(1, ...edges.map((e) => e.count));
  const colorMode = colorByCode.size >= 2;

  // Offset sibling country edges sharing same endpoints
  const pairIndex = useMemo(() => {
    const map = new Map<string, number>();
    const out = new Map<string, number>();
    for (const e of edges) {
      const pk = `${e.from}->${e.to}${e.dashed ? ":re" : ""}`;
      const i = map.get(pk) ?? 0;
      out.set(`${pk}\0${e.country ?? ""}`, i);
      map.set(pk, i + 1);
    }
    return out;
  }, [edges]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-h-[360px] rounded-md border bg-muted/20"
      role="img"
      aria-label="Prospect journey unique-node graph"
    >
      <defs>
        <marker
          id="journey-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = byPath.get(e.from);
        const b = byPath.get(e.to);
        if (!a || !b) return null;
        const isBack = a.x > b.x;
        const pk = `${e.from}->${e.to}${e.dashed ? ":re" : ""}`;
        const idx = pairIndex.get(`${pk}\0${e.country ?? ""}`) ?? 0;
        const bend = (isBack || e.dashed ? -36 : 0) + (colorMode ? idx * -14 : 0);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + bend;
        const sw = edgeStrokeWidth(e.count, maxCount);
        const stroke =
          colorMode && e.country && colorByCode.has(e.country)
            ? colorByCode.get(e.country)!
            : undefined;
        return (
          <path
            key={`${e.from}->${e.to}:${e.country ?? ""}:${e.dashed ? "re" : "s"}`}
            d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
            fill="none"
            stroke={stroke ?? "currentColor"}
            className={
              stroke
                ? undefined
                : e.dashed
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground/70"
            }
            strokeWidth={sw}
            strokeDasharray={e.dashed ? "6 4" : undefined}
            markerEnd="url(#journey-arrow)"
            opacity={stroke ? 0.85 : undefined}
          />
        );
      })}
      {laid.map((n) => {
        const selected = selectedPath === n.path;
        const isSink = n.path === DROP_OFF;
        return (
          <g
            key={n.path}
            transform={`translate(${n.x}, ${n.y})`}
            className="cursor-pointer"
            onClick={() => onSelect(n.path)}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelect(n.path);
              }
            }}
          >
            <rect
              x={-70}
              y={-38}
              width={140}
              height={76}
              rx={8}
              className={
                isSink
                  ? "fill-background stroke-destructive/60"
                  : selected
                    ? "fill-background stroke-foreground"
                    : "fill-background stroke-border"
              }
              strokeWidth={selected ? 2 : 1}
            />
            <text
              textAnchor="middle"
              y={-20}
              className="fill-foreground text-[11px] font-medium"
            >
              {labelPath(n.path)}
            </text>
            {!isSink ? (
              <>
                <text textAnchor="middle" y={-4} className="fill-muted-foreground text-[9px]">
                  {n.prospects} prospects · {n.dropOffPct}% drop
                </text>
                <text textAnchor="middle" y={12} className="fill-muted-foreground text-[9px]">
                  dwell {formatDwell(n.medianDwellMs)}
                  {n.topDropOffSection ? ` · #${n.topDropOffSection}` : ""}
                </text>
                <text textAnchor="middle" y={28} className="fill-muted-foreground text-[8px]">
                  {n.returnHits > 0
                    ? `returns ${n.returnHits}${
                        n.medianReturnGapMs != null
                          ? ` · gap ${formatGap(n.medianReturnGapMs)}`
                          : ""
                      }`
                    : "returns 0"}
                </text>
              </>
            ) : (
              <text textAnchor="middle" y={4} className="fill-muted-foreground text-[10px]">
                {n.views} visits
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ProspectJourneyCard({ from, to }: Props) {
  const [nodes, setNodes] = useState<JourneyTransitionNode[]>([]);
  const [edges, setEdges] = useState<JourneyTransitionEdge[]>([]);
  const [sections, setSections] = useState<JourneySectionNode[]>([]);
  const [expandablePaths, setExpandablePaths] = useState<string[]>([]);
  const [entrySources, setEntrySources] = useState<string[]>([]);
  const [entrySource, setEntrySource] = useState<string>(ALL);
  const [visitorCohort, setVisitorCohort] = useState<string>(ALL);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryLegend, setCountryLegend] = useState<
    { code: string; color: string }[]
  >([]);
  const [expandPath, setExpandPath] = useState<string | null>(null);
  const [detailPath, setDetailPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<JourneyNodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProspectJourneyTransitions({
        from,
        to,
        entrySource: entrySource === ALL ? null : entrySource,
        visitorCohort:
          visitorCohort === "new" || visitorCohort === "returning"
            ? visitorCohort
            : null,
        countries: selectedCountries.length > 0 ? selectedCountries : null,
        expandPath,
        detailPath,
      });
      if (!res.ok) {
        setError(res.error);
        setNodes([]);
        setEdges([]);
        setSections([]);
        setExpandablePaths([]);
        setDetail(null);
        setCountryLegend([]);
        return;
      }
      setNodes(res.nodes);
      setEdges(res.edges);
      setSections(res.sections);
      setExpandablePaths(res.expandablePaths);
      setEntrySources(res.entrySources);
      setCountryOptions(res.countries);
      setCountryLegend(res.countryLegend);
      setDetail(res.detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setNodes([]);
      setEdges([]);
      setSections([]);
      setExpandablePaths([]);
      setDetail(null);
      setCountryLegend([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, entrySource, visitorCohort, selectedCountries, expandPath, detailPath]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleExpand(path: string) {
    setExpandPath((prev) => (prev === path ? null : path));
  }

  function toggleCountry(code: string) {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  const colorByCode = useMemo(
    () => new Map(countryLegend.map((c) => [c.code, c.color])),
    [countryLegend],
  );

  const pageSections = expandPath
    ? sections.filter((s) => s.path === expandPath)
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">Prospect journey</CardTitle>
          <CardDescription>
            Unique-node page graph from our DB. Loops reuse one node with a back-edge.
            Click a node for exit sections, dwell, and sample paths.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh journey"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="entry-source-filter" className="text-xs font-medium text-muted-foreground">
            Entry source
          </label>
          <Select value={entrySource} onValueChange={setEntrySource}>
            <SelectTrigger id="entry-source-filter" className="h-8 w-[220px]">
              <SelectValue placeholder="All entry sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All entry sources</SelectItem>
              {entrySources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label
            htmlFor="visitor-cohort-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Visitors
          </label>
          <Select value={visitorCohort} onValueChange={setVisitorCohort}>
            <SelectTrigger id="visitor-cohort-filter" className="h-8 w-[180px]">
              <SelectValue placeholder="All visitors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All visitors</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="returning">Returning</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs font-medium text-muted-foreground">Country</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-[160px] justify-between font-normal"
                aria-label="Filter countries"
              >
                {selectedCountries.length === 0
                  ? "All countries"
                  : selectedCountries.length === 1
                    ? selectedCountries[0]
                    : `${selectedCountries.length} countries`}
                <ChevronDown className="ml-2 h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              {countryOptions.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No countries yet.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {countryOptions.map((code) => {
                    const checked = selectedCountries.includes(code);
                    return (
                      <li key={code}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCountry(code)}
                          />
                          <span className="font-mono text-xs">{code}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedCountries.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 w-full text-xs"
                  onClick={() => setSelectedCountries([])}
                >
                  Clear
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No page views in this range yet. Browse the storefront to generate transitions.
          </p>
        ) : (
          <div className="space-y-3">
            {!expandPath && expandablePaths.length > 0 ? (
              <ul className="flex flex-wrap gap-2 text-sm">
                {expandablePaths.map((p) => (
                  <li key={`expand-${p}`}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleExpand(p)}
                      aria-expanded={false}
                    >
                      <ChevronRight className="h-3 w-3" />
                      Expand {p}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {expandPath ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setExpandPath(null)}
                  aria-expanded={true}
                >
                  <ChevronDown className="h-3 w-3" />
                  Collapse {expandPath}
                </button>
                {pageSections.length > 0 ? (
                  <ul className="max-h-28 space-y-1 overflow-auto border-l pl-2 text-sm">
                    {pageSections.map((s) => (
                      <li
                        key={`${s.path}#${s.sectionId}`}
                        className="flex justify-between gap-2 font-mono text-xs"
                      >
                        <span className="truncate">#{s.sectionId}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {s.views}v / {s.dropOffs}d
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No section views for this page yet.
                  </p>
                )}
              </div>
            ) : null}
            <JourneyGraph
              nodes={nodes}
              edges={edges}
              selectedPath={detailPath}
              onSelect={(path) => setDetailPath(path === DROP_OFF ? null : path)}
              colorByCode={colorByCode}
            />
            {countryLegend.length >= 2 ? (
              <ul
                className="flex flex-wrap gap-3 text-xs"
                aria-label="Country color legend"
              >
                {countryLegend.map((c) => (
                  <li key={c.code} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                    <span className="font-mono">{c.code}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </CardContent>

      <Sheet
        open={detailPath != null && detailPath !== DROP_OFF}
        onOpenChange={(open) => {
          if (!open) setDetailPath(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detailPath ? labelPath(detailPath) : "Node"}</SheetTitle>
            <SheetDescription>
              Exit sections, dwell, and sample Visit paths for this page node.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 overflow-auto text-sm">
            {!detail || detail.path !== detailPath ? (
              <p className="text-muted-foreground">Loading detail…</p>
            ) : (
              <>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Median dwell
                  </p>
                  <p>{formatDwell(detail.medianDwellMs)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Exit sections
                  </p>
                  {detail.exitSections.length === 0 ? (
                    <p className="text-muted-foreground">No section-level drop-offs yet.</p>
                  ) : (
                    <ul className="space-y-1 font-mono text-xs">
                      {detail.exitSections.map((s) => (
                        <li key={s.sectionId} className="flex justify-between gap-2">
                          <span>#{s.sectionId}</span>
                          <span className="text-muted-foreground">{s.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dwell samples
                  </p>
                  {detail.dwellMsSamples.length === 0 ? (
                    <p className="text-muted-foreground">No dwell samples yet.</p>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground">
                      {detail.dwellMsSamples
                        .slice(0, 8)
                        .map((ms) => formatDwell(ms))
                        .join(" · ")}
                      {detail.dwellMsSamples.length > 8
                        ? ` · +${detail.dwellMsSamples.length - 8}`
                        : ""}
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sample paths
                  </p>
                  {detail.samplePaths.length === 0 ? (
                    <p className="text-muted-foreground">No paths yet.</p>
                  ) : (
                    <ul className="space-y-1 font-mono text-xs">
                      {detail.samplePaths.map((p, i) => (
                        <li key={i} className="truncate">
                          {p.map(labelPath).join(" → ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Return timeline
                  </p>
                  {detail.returnTimeline.length === 0 ? (
                    <p className="text-muted-foreground">No returns landed here.</p>
                  ) : (
                    <ul className="space-y-1 font-mono text-xs">
                      {detail.returnTimeline.map((r, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate text-muted-foreground">
                            {r.priorDropOffPath
                              ? `${labelPath(r.priorDropOffPath)} → Drop-off → here`
                              : "Drop-off → here"}
                          </span>
                          <span className="shrink-0">{formatGap(r.gapMs)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
