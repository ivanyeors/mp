"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RefreshCw,
  Scan,
  X,
} from "lucide-react";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import {
  edgeStrokeWidth,
  edgeTrafficMixPct,
  edgeTrafficOpacity,
} from "@/lib/analytics/journey/chrome";
import { CONVERTED_NODE } from "@/lib/analytics/journey/converted-sink";
import {
  DIVE_ENTRY,
  DIVE_EXIT,
  buildDiveGraph,
  isDivePort,
  layoutDiveGraph,
} from "@/lib/analytics/journey/dive";
import { layoutJourneyGraph } from "@/lib/analytics/journey/layout";
import {
  exitSectionHref,
  isSectionChildPath,
} from "@/lib/analytics/journey/paths";
import type { Locale } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  getProspectJourneyNodeDetail,
  getProspectJourneyTransitions,
  type JourneyConvertedDetail,
  type JourneyNodeDetail,
  type JourneyTransitionEdge,
  type JourneyTransitionNode,
} from "./actions";
import {
  RoutesChart,
  TimeOnPageChart,
  routesBlockH,
  timeOnPageBlockH,
} from "./DigInViz";

type Props = { from: string; to: string };

const ALL = "__all__";
const DROP_OFF = "__drop_off__";
const CONVERTED = CONVERTED_NODE;
const LAYOUT_KEY = "prospect-journey-layout-v1";
const DIVE_LAYOUT_PREFIX = "prospect-journey-dive-v1:";
const DRAG_THRESHOLD = 4;
const PORT_R = 4;
const NODE_W = 156;
const NODE_H = 92;
const NODE_W_EXP = 304;
/** KPI chrome above page dig-in (path + prospects + drop bar). */
const EXP_KPI_H = 96;
const EXP_CONV_TOP = 10;
const EXP_BOTTOM_PAD = 8;
const WORLD_W = 640;
const WORLD_H = 400;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const PAN_NUDGE = 40;

const edgeTooltipStyles: CSSProperties = {
  ...(defaultStyles as CSSProperties),
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "12px",
  position: "fixed",
  zIndex: 1000,
  pointerEvents: "none",
};

type EdgeTooltipData = {
  from: string;
  to: string;
  count: number;
  sharePct: number;
  country?: string;
  dashed?: boolean;
};

function labelPath(path: string) {
  if (path === DROP_OFF) return "Drop-off";
  if (path === CONVERTED) return "Converted";
  if (path === DIVE_ENTRY) return "Entry";
  if (path === DIVE_EXIT) return "Exit";
  const hash = path.indexOf("#");
  if (hash >= 0) return path.slice(hash + 1);
  return path === "/" ? "Home" : path;
}

function layoutStorageKey(divePath: string | null) {
  return divePath ? `${DIVE_LAYOUT_PREFIX}${divePath}` : LAYOUT_KEY;
}

function stubChrome(path: string, views: number): JourneyTransitionNode {
  return {
    path,
    views,
    prospects: views,
    dropOffs: 0,
    dropOffPct: 0,
    medianDwellMs: null,
    topDropOffSection: null,
    returnHits: 0,
    medianReturnGapMs: null,
  };
}

/** Focused section view for one page (Houdini-style dive). */
function toDiveDisplay(
  pagePath: string,
  nodes: JourneyTransitionNode[],
  edges: JourneyTransitionEdge[],
): { nodes: JourneyTransitionNode[]; edges: JourneyTransitionEdge[] } {
  const dive = buildDiveGraph(pagePath, nodes, edges);
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  return {
    nodes: dive.nodes.map((n) => byPath.get(n.path) ?? stubChrome(n.path, n.views)),
    edges: dive.edges,
  };
}

function formatValue(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function truncateLabel(s: string, maxChars: number): { text: string; full: string } {
  if (s.length <= maxChars) return { text: s, full: s };
  return { text: `${s.slice(0, Math.max(1, maxChars - 1))}…`, full: s };
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

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

type LayoutNode = JourneyTransitionNode & { x: number; y: number };
type PosMap = Record<string, { x: number; y: number }>;
type Camera = { x: number; y: number; k: number };

function loadPositions(key: string): PosMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PosMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePositions(key: string, pos: PosMap) {
  try {
    localStorage.setItem(key, JSON.stringify(pos));
  } catch {
    /* ponytail: quota/private mode — layout just won't persist */
  }
}

function canExpandNode(path: string) {
  return (
    path !== DROP_OFF &&
    !isSectionChildPath(path) &&
    !isDivePort(path)
  );
}

/** Dig-in body height so the expanded node can grow to fit (no inner scroll). */
function pageDigInH(detail: JourneyNodeDetail | null): number {
  const chrome = 30 + 16; // title bar + padding
  if (!detail) return chrome + 120;
  let h = chrome + 48; // median dwell hero
  const block = (body: number) => 14 + body + 10;
  h += block(
    (detail.exitSections?.length ?? 0) === 0
      ? 16
      : detail.exitSections.length * 32,
  );
  h += block(
    (detail.outbound?.length ?? 0) === 0 ? 16 : detail.outbound.length * 24,
  );
  h += block(timeOnPageBlockH(detail.dwellMsSamples?.length ?? 0));
  h += block(routesBlockH(detail.routes?.length ?? 0));
  h += block(
    (detail.returnTimeline?.length ?? 0) === 0
      ? 16
      : detail.returnTimeline.length * 26,
  );
  return h + 12; // slack so foreignObject never clips
}

function convertedDigInH(detail: JourneyConvertedDetail | null): number {
  const chrome = 30 + 16;
  if (!detail) return chrome + 100;
  if (detail.count === 0) return chrome + 20;
  let h = chrome + 58;
  h += 14 + Math.max(1, detail.byEntrySource.length) * 24 + 10;
  h += 14 + detail.samples.length * 68 + 10;
  return h + 12;
}

function expandedNodeBox(
  isConverted: boolean,
  detail: JourneyNodeDetail | null,
  convertedDetail: JourneyConvertedDetail | null,
): { hw: number; hh: number; digInTop: number; digInH: number } {
  const digInH = isConverted
    ? convertedDigInH(convertedDetail)
    : pageDigInH(detail);
  const digInTop = isConverted ? EXP_CONV_TOP : EXP_KPI_H;
  const totalH = digInTop + digInH + EXP_BOTTOM_PAD;
  return { hw: NODE_W_EXP / 2, hh: totalH / 2, digInTop, digInH };
}

function nodeHalfSize(expanded: boolean) {
  return expanded
    ? { hw: NODE_W_EXP / 2, hh: (EXP_KPI_H + 200) / 2 }
    : { hw: NODE_W / 2, hh: NODE_H / 2 };
}

function fitCamera(laid: LayoutNode[], vw: number, vh: number, pad = 110): Camera {
  if (laid.length === 0 || vw <= 0 || vh <= 0) return { x: 0, y: 0, k: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of laid) {
    const { hw, hh } = nodeHalfSize(false);
    minX = Math.min(minX, n.x - hw);
    minY = Math.min(minY, n.y - hh);
    maxX = Math.max(maxX, n.x + hw);
    maxY = Math.max(maxY, n.y + hh);
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const k = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh)),
  );
  const x = (vw - bw * k) / 2 - minX * k;
  const y = (vh - bh * k) / 2 - minY * k;
  return { x, y, k };
}

/** Cubic noodle from source out-port to target in-port. */
function cubicEdgePath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  aHw: number,
  bHw: number,
  bendY: number,
): string {
  const x1 = ax + aHw + PORT_R;
  const y1 = ay;
  const x2 = bx - bHw - PORT_R;
  const y2 = by;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
  const c1x = x1 + dx;
  const c1y = y1 + bendY * 0.35;
  const c2x = x2 - dx;
  const c2y = y2 + bendY * 0.35;
  return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
}


function edgeKey(e: JourneyTransitionEdge) {
  return `${e.from}->${e.to}:${e.country ?? ""}:${e.dashed ? "re" : "s"}`;
}

/** Semantic base hue: drop-off / converted / return / forward. */
function edgeHueVar(e: JourneyTransitionEdge): string {
  if (e.to === DROP_OFF) return "var(--destructive)";
  if (e.to === CONVERTED) return "var(--chart-2)";
  if (e.dashed) return "var(--muted-foreground)";
  return "var(--chart-3)";
}

function edgeTrafficStroke(
  e: JourneyTransitionEdge,
  maxCount: number,
  colorByCode: Map<string, string>,
  colorMode: boolean,
): { stroke: string; opacity: number } {
  if (colorMode && e.country && colorByCode.has(e.country)) {
    return {
      stroke: colorByCode.get(e.country)!,
      opacity: edgeTrafficOpacity(e.count, maxCount),
    };
  }
  const pct = edgeTrafficMixPct(e.count, maxCount);
  return {
    stroke: `color-mix(in oklab, ${edgeHueVar(e)} ${pct}%, var(--muted))`,
    opacity: e.dashed ? 0.85 : 0.95,
  };
}

/** Accent for node left rail from drop-off severity. */
function dropAccentClass(dropOffPct: number): string {
  if (dropOffPct >= 50) return "fill-destructive";
  if (dropOffPct >= 25) return "fill-[var(--chart-1)]";
  return "fill-[var(--chart-2)]";
}

function SvgText({
  children,
  maxChars,
  className,
  y,
  textAnchor = "middle",
  x = 0,
}: {
  children: string;
  maxChars: number;
  className?: string;
  y: number;
  textAnchor?: "middle" | "start" | "end";
  x?: number;
}) {
  const { text, full } = truncateLabel(children, maxChars);
  return (
    <text x={x} y={y} textAnchor={textAnchor} className={className}>
      {text !== full ? <title>{full}</title> : null}
      {text}
    </text>
  );
}

/** Compact node body — primary KPI + drop bar + one meta line. */
function NodeCardBody({
  n,
  hw,
  hh,
  selected,
  isDropOff,
  isConverted,
}: {
  n: LayoutNode;
  hw: number;
  hh: number;
  selected: boolean;
  isDropOff: boolean;
  isConverted: boolean;
}) {
  const isPort = isDivePort(n.path);
  const isSection = isSectionChildPath(n.path);
  const isSink = isDropOff || isConverted || isPort;
  const padX = 12;
  const left = -hw + padX;
  const barW = hw * 2 - padX * 2 - (isSink || isSection ? 0 : 6);
  const dropFill = Math.min(1, Math.max(0, n.dropOffPct / 100));

  if (isSink || isSection) {
    return (
      <>
        <SvgText
          x={0}
          y={-6}
          maxChars={16}
          className={
            isDropOff
              ? "fill-destructive text-[12px] font-semibold"
              : "fill-foreground text-[12px] font-semibold"
          }
        >
          {labelPath(n.path)}
        </SvgText>
        <SvgText y={14} maxChars={18} className="fill-muted-foreground text-[11px]">
          {isConverted
            ? `${n.views} orders`
            : isPort
              ? `${n.views} transitions`
              : `${n.views} views`}
        </SvgText>
      </>
    );
  }

  const titleY = -hh + 16;
  const kpiY = -hh + 42;
  const barY = -hh + 56;
  const metaY = selected ? -hh + 84 : -hh + 78;

  return (
    <>
      <rect
        x={-hw}
        y={-hh + 10}
        width={4}
        height={selected ? 72 : hh * 2 - 20}
        rx={2}
        className={dropAccentClass(n.dropOffPct)}
      />
      <SvgText
        x={left + 4}
        y={titleY}
        textAnchor="start"
        maxChars={selected ? 26 : 18}
        className="fill-foreground text-[11px] font-semibold"
      >
        {labelPath(n.path)}
      </SvgText>
      <text
        x={left + 4}
        y={kpiY}
        textAnchor="start"
        className="fill-foreground text-[20px] font-semibold tabular-nums"
      >
        {n.prospects}
      </text>
      <text
        x={left + 4 + Math.min(5, String(n.prospects).length) * 12 + 6}
        y={kpiY}
        textAnchor="start"
        className="fill-muted-foreground text-[10px]"
      >
        prospects
      </text>
      <rect x={left + 4} y={barY} width={barW} height={5} rx={2.5} className="fill-muted" />
      <rect
        x={left + 4}
        y={barY}
        width={Math.max(0, barW * dropFill)}
        height={5}
        rx={2.5}
        className={dropAccentClass(n.dropOffPct)}
        opacity={0.85}
      />
      <SvgText
        x={left + 4}
        y={barY + 16}
        textAnchor="start"
        maxChars={selected ? 30 : 22}
        className="fill-muted-foreground text-[9px]"
      >
        {`${n.dropOffPct}% drop${
          n.topDropOffSection ? ` · #${n.topDropOffSection}` : ""
        }`}
      </SvgText>
      <SvgText
        x={left + 4}
        y={metaY}
        textAnchor="start"
        maxChars={selected ? 30 : 22}
        className="fill-muted-foreground/90 text-[9px]"
      >
        {selected
          ? `dwell ${formatDwell(n.medianDwellMs)} · ${n.views} views · ret ${n.returnHits}${
              n.medianReturnGapMs != null ? ` (${formatGap(n.medianReturnGapMs)})` : ""
            }`
          : `dwell ${formatDwell(n.medianDwellMs)} · ret ${n.returnHits}`}
      </SvgText>
    </>
  );
}

function DigInSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-medium text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function DigInEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground/80">{children}</p>;
}

function DigInShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="flex h-full cursor-default flex-col overflow-hidden rounded-md bg-card text-foreground"
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
        <p className="truncate text-[10px] font-medium tracking-wide text-muted-foreground">
          {title}
        </p>
        <button
          type="button"
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="Collapse node"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2.5 px-2.5 py-2">{children}</div>
    </div>
  );
}

/** In-node dig-in body (HTML inside foreignObject). */
function ExpandedPageDigIn({
  detailPath,
  detail,
  locale,
  onClose,
}: {
  detailPath: string;
  detail: JourneyNodeDetail | null;
  locale: Locale;
  onClose: () => void;
}) {
  const ready = detail && detail.path === detailPath;
  return (
    <DigInShell title="Node detail" onClose={onClose}>
      {!ready ? (
        <div className="space-y-2.5" aria-busy={true} aria-label="Loading detail">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ) : (
        <>
          <div className="rounded-md bg-muted/55 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">Median dwell</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
              {formatDwell(detail.medianDwellMs)}
            </p>
          </div>

          <DigInSection title="Exit sections">
            {detail.exitSections.length === 0 ? (
              <DigInEmpty>No section-level drop-offs yet.</DigInEmpty>
            ) : (
              <ul className="space-y-2">
                {detail.exitSections.map((s) => (
                  <li key={s.sectionId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={exitSectionHref(locale, detailPath, s.sectionId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        <span className="truncate">#{s.sectionId}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                        {s.count}
                        <span className="mx-1 text-border">·</span>
                        {s.sharePct}%
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive/75"
                        style={{ width: `${Math.min(100, Math.max(0, s.sharePct))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DigInSection>

          <DigInSection title="Outbound">
            {detail.outbound.length === 0 ? (
              <DigInEmpty>No outbound transitions.</DigInEmpty>
            ) : (
              <ul className="space-y-0.5">
                {detail.outbound.map((o) => {
                  const isDrop = o.to === DROP_OFF;
                  return (
                    <li
                      key={o.to}
                      className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px]">
                        <ArrowRight
                          className={`h-3 w-3 shrink-0 ${
                            isDrop ? "text-destructive" : "text-muted-foreground"
                          }`}
                        />
                        <span className={isDrop ? "font-medium text-destructive" : undefined}>
                          {labelPath(o.to)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] font-medium">
                        {o.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DigInSection>

          <DigInSection title="Time on page">
            <TimeOnPageChart samplesMs={detail.dwellMsSamples} />
          </DigInSection>

          <DigInSection title="Routes">
            <RoutesChart routes={detail.routes} labelPath={labelPath} />
          </DigInSection>

          <DigInSection title="Return timeline">
            {detail.returnTimeline.length === 0 ? (
              <DigInEmpty>No returns landed here.</DigInEmpty>
            ) : (
              <ul className="space-y-1">
                {detail.returnTimeline.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/40"
                  >
                    <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                      {r.priorDropOffPath
                        ? `${labelPath(r.priorDropOffPath)} → Drop-off → here`
                        : "Drop-off → here"}
                    </span>
                    <span className="shrink-0 tabular-nums text-[11px] font-medium">
                      {formatGap(r.gapMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DigInSection>
        </>
      )}
    </DigInShell>
  );
}

function ExpandedConvertedDigIn({
  detail,
  onClose,
}: {
  detail: JourneyConvertedDetail | null;
  onClose: () => void;
}) {
  return (
    <DigInShell title="Converted" onClose={onClose}>
      {!detail ? (
        <div className="space-y-2.5" aria-busy={true} aria-label="Loading detail">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      ) : detail.count === 0 ? (
        <DigInEmpty>No paid orders linked in this range.</DigInEmpty>
      ) : (
        <>
          <div className="rounded-md bg-muted/55 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">Orders</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
              {detail.count}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatValue(detail.totalValue)} total
            </p>
          </div>

          <DigInSection title="Last-touch entry source">
            {detail.byEntrySource.length === 0 ? (
              <DigInEmpty>—</DigInEmpty>
            ) : (
              <ul className="space-y-0.5">
                {detail.byEntrySource.map((s) => (
                  <li
                    key={s.entrySource}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
                  >
                    <span className="truncate text-[11px]">{s.entrySource}</span>
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {s.count}
                      <span className="mx-1 text-border">·</span>
                      {formatValue(s.totalValue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DigInSection>

          <DigInSection title="Sample conversions">
            <ul className="space-y-1.5">
              {detail.samples.map((s, i) => (
                <li key={i} className="rounded-md border border-border/70 bg-muted/30 p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[11px] font-medium">{s.entrySource}</p>
                    <p className="shrink-0 tabular-nums text-[11px] font-medium">
                      {formatValue(s.orderValue)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Journey {formatDwell(s.journeyDurationMs)}
                  </p>
                  <p
                    className="mt-1 line-clamp-2 font-mono text-[10px] leading-snug text-muted-foreground"
                    title={s.shortPath.map(labelPath).join(" → ")}
                  >
                    {s.shortPath.map(labelPath).join(" → ")}
                  </p>
                </li>
              ))}
            </ul>
          </DigInSection>
        </>
      )}
    </DigInShell>
  );
}

function JourneyGraph({
  nodes,
  edges,
  selectedPaths,
  onToggleSelect,
  onClearSelection,
  colorByCode,
  detailsByPath,
  convertedDetailByPath,
  locale,
  divePath,
  expandablePaths,
  onDive,
  onExitDive,
  filterBar,
}: {
  nodes: JourneyTransitionNode[];
  edges: JourneyTransitionEdge[];
  selectedPaths: string[];
  onToggleSelect: (path: string) => void;
  onClearSelection: () => void;
  colorByCode: Map<string, string>;
  detailsByPath: Map<string, JourneyNodeDetail>;
  convertedDetailByPath: Map<string, JourneyConvertedDetail>;
  locale: Locale;
  divePath: string | null;
  expandablePaths: string[];
  onDive: (path: string) => void;
  onExitDive: () => void;
  filterBar: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 500 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [overrides, setOverrides] = useState<PosMap>({});
  const [fittedKey, setFittedKey] = useState("");
  const [hoverEdgeKey, setHoverEdgeKey] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState(false);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const posKey = layoutStorageKey(divePath);
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<EdgeTooltipData>();

  const dragRef = useRef<{
    path: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    setOverrides(loadPositions(posKey));
    setFittedKey(""); // refit after persisted positions apply
  }, [posKey]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setViewport({ w: Math.max(1, cr.width), h: Math.max(1, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  const seeded = useMemo(() => {
    if (divePath) {
      return layoutDiveGraph(nodes, WORLD_W, WORLD_H) as LayoutNode[];
    }
    return layoutJourneyGraph(nodes, edges, WORLD_W, WORLD_H) as LayoutNode[];
  }, [nodes, edges, divePath]);
  const laid = useMemo(() => {
    return seeded.map((n) => {
      const o = overrides[n.path];
      return o ? { ...n, x: o.x, y: o.y } : n;
    });
  }, [seeded, overrides]);
  const byPath = useMemo(() => new Map(laid.map((n) => [n.path, n])), [laid]);
  const maxCount = Math.max(1, ...edges.map((e) => e.count));
  const totalTransitions = useMemo(
    () => edges.reduce((s, e) => s + e.count, 0),
    [edges],
  );
  const colorMode = colorByCode.size >= 2;

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

  useEffect(() => {
    if (laid.length === 0 || viewport.w < 40) return;
    const key = `${laid.map((n) => n.path).join("|")}:${Math.round(viewport.w)}x${Math.round(viewport.h)}`;
    if (key === fittedKey) return;
    setCamera(fitCamera(laid, viewport.w, viewport.h));
    setFittedKey(key);
  }, [laid, viewport, fittedKey]);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    const cam = cameraRef.current;
    return { x: (p.x - cam.x) / cam.k, y: (p.y - cam.y) / cam.k };
  }, []);

  const onNodePointerMove = useCallback(
    (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { x, y } = clientToWorld(ev.clientX, ev.clientY);
      const dx = x - d.startX;
      const dy = y - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!d.moved) setDraggingNode(true);
      d.moved = true;
      setOverrides((prev) => {
        const next = { ...prev, [d.path]: { x: d.origX + dx, y: d.origY + dy } };
        savePositions(posKey, next);
        return next;
      });
    },
    [clientToWorld, posKey],
  );

  const onNodePointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDraggingNode(false);
    window.removeEventListener("pointermove", onNodePointerMove);
    window.removeEventListener("pointerup", onNodePointerUp);
    if (!d) return;
    if (!d.moved && !divePath && canExpandNode(d.path)) {
      onToggleSelect(d.path);
    }
  }, [onNodePointerMove, onToggleSelect, divePath]);

  const onPanMove = useCallback((ev: PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    const dx = ev.clientX - p.startClientX;
    const dy = ev.clientY - p.startClientY;
    setCamera((c) => ({ ...c, x: p.origX + dx, y: p.origY + dy }));
  }, []);

  const onPanUp = useCallback(() => {
    panRef.current = null;
    setPanning(false);
    window.removeEventListener("pointermove", onPanMove);
    window.removeEventListener("pointerup", onPanUp);
  }, [onPanMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onNodePointerMove);
      window.removeEventListener("pointerup", onNodePointerUp);
      window.removeEventListener("pointermove", onPanMove);
      window.removeEventListener("pointerup", onPanUp);
    };
  }, [onNodePointerMove, onNodePointerUp, onPanMove, onPanUp]);

  function startPan(ev: ReactPointerEvent) {
    ev.preventDefault();
    panRef.current = {
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      origX: cameraRef.current.x,
      origY: cameraRef.current.y,
    };
    setPanning(true);
    window.addEventListener("pointermove", onPanMove);
    window.addEventListener("pointerup", onPanUp);
  }

  function onNodePointerDown(path: string, ev: ReactPointerEvent) {
    if (spaceDown || ev.button === 1) {
      startPan(ev);
      return;
    }
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const n = byPath.get(path);
    if (!n) return;
    const { x, y } = clientToWorld(ev.clientX, ev.clientY);
    dragRef.current = {
      path,
      startX: x,
      startY: y,
      origX: n.x,
      origY: n.y,
      moved: false,
    };
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    window.addEventListener("pointermove", onNodePointerMove);
    window.addEventListener("pointerup", onNodePointerUp);
  }

  function onCanvasPointerDown(ev: ReactPointerEvent) {
    if (ev.button === 1 || (ev.button === 0 && spaceDown)) {
      startPan(ev);
      return;
    }
    if (ev.button === 0) {
      clearEdgeTooltip();
      onClearSelection();
    }
  }

  function fitView() {
    setCamera(fitCamera(laid, viewport.w, viewport.h));
  }

  function arrangeNodes() {
    setOverrides({});
    try {
      localStorage.removeItem(posKey);
    } catch {
      /* ignore */
    }
    setFittedKey("");
    const next = divePath
      ? (layoutDiveGraph(nodes, WORLD_W, WORLD_H) as LayoutNode[])
      : (layoutJourneyGraph(nodes, edges, WORLD_W, WORLD_H) as LayoutNode[]);
    setCamera(fitCamera(next, viewport.w, viewport.h));
  }

  function showEdgeTooltip(e: JourneyTransitionEdge, clientX: number, clientY: number) {
    const sharePct =
      totalTransitions > 0
        ? Math.round((e.count / totalTransitions) * 1000) / 10
        : 0;
    setHoverEdgeKey(edgeKey(e));
    showTooltip({
      tooltipLeft: clientX + 12,
      tooltipTop: clientY + 12,
      tooltipData: {
        from: e.from,
        to: e.to,
        count: e.count,
        sharePct,
        country: e.country,
        dashed: e.dashed,
      },
    });
  }

  function clearEdgeTooltip() {
    setHoverEdgeKey(null);
    hideTooltip();
  }

  // Non-passive wheel so we can preventDefault (page scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const el = svgRef.current;
      if (!el) return;
      const pt = el.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const ctm = el.getScreenCTM();
      if (!ctm) return;
      const p = pt.matrixTransform(ctm.inverse());
      const cam = cameraRef.current;
      const factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nextK = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.k * factor));
      const wx = (p.x - cam.x) / cam.k;
      const wy = (p.y - cam.y) / cam.k;
      setCamera({
        k: nextK,
        x: p.x - wx * nextK,
        y: p.y - wy * nextK,
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [fullscreen]);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (isTypingTarget(ev.target)) return;
      if (ev.code === "Space") {
        ev.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (ev.key === "Escape") {
        if (selectedPaths.length > 0) {
          onClearSelection();
          return;
        }
        if (divePath) {
          onExitDive();
          return;
        }
        if (fullscreen) setFullscreen(false);
        return;
      }
      if ((ev.key === "u" || ev.key === "U") && divePath) {
        if (!ev.metaKey && !ev.ctrlKey && !ev.altKey) {
          ev.preventDefault();
          onExitDive();
        }
        return;
      }
      if (ev.key === "f" || ev.key === "F") {
        if (!ev.metaKey && !ev.ctrlKey && !ev.altKey) {
          ev.preventDefault();
          setFullscreen((v) => !v);
        }
        return;
      }
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        setCamera((c) => ({ ...c, x: c.x + PAN_NUDGE }));
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        setCamera((c) => ({ ...c, x: c.x - PAN_NUDGE }));
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setCamera((c) => ({ ...c, y: c.y + PAN_NUDGE }));
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setCamera((c) => ({ ...c, y: c.y - PAN_NUDGE }));
      }
    }
    function onKeyUp(ev: KeyboardEvent) {
      if (ev.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    fullscreen,
    onClearSelection,
    onExitDive,
    selectedPaths.length,
    divePath,
  ]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const drawOrder = useMemo(() => {
    const rest = laid.filter((n) => !selectedSet.has(n.path));
    const sel = laid.filter((n) => selectedSet.has(n.path));
    return [...rest, ...sel];
  }, [laid, selectedSet]);

  const cursorClass = panning || draggingNode
    ? "cursor-grabbing"
    : spaceDown
      ? "cursor-grab"
      : "cursor-default";

  const shellClass = fullscreen
    ? `fixed inset-0 z-50 flex flex-col bg-background ${cursorClass}`
    : `relative h-[min(80vh,860px)] w-full overflow-hidden bg-muted/30 ${cursorClass}`;

  return (
    <div ref={shellRef} className={shellClass} tabIndex={0}>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-30 flex flex-col gap-2">
        <nav
          className="pointer-events-auto flex min-h-8 flex-wrap items-center gap-1 rounded-md border bg-background/95 px-2 py-1 text-xs shadow-sm"
          aria-label="Journey breadcrumb"
        >
          <button
            type="button"
            className={
              divePath
                ? "cursor-pointer rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
                : "cursor-default rounded px-1.5 py-0.5 font-medium text-foreground"
            }
            onClick={() => {
              if (divePath) onExitDive();
            }}
            aria-current={divePath ? undefined : "page"}
          >
            Journey
          </button>
          {divePath ? (
            <>
              <span className="text-muted-foreground" aria-hidden>
                /
              </span>
              <span
                className="truncate rounded px-1.5 py-0.5 font-medium text-foreground"
                aria-current="page"
                title={divePath}
              >
                {labelPath(divePath)}
              </span>
              <span className="text-muted-foreground">· sections</span>
            </>
          ) : null}
        </nav>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border bg-background/95 p-1.5 shadow-sm">
          {filterBar}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={arrangeNodes}
              aria-label="Arrange nodes"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Arrange
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={fitView}
              aria-label="Fit view"
            >
              <Scan className="h-3.5 w-3.5" />
              Fit
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setFullscreen((v) => !v)}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              {fullscreen ? "Exit" : "Full"}
            </Button>
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label="Prospect journey unique-node graph"
        onPointerDown={onCanvasPointerDown}
        onAuxClick={(ev) => ev.preventDefault()}
        onContextMenu={(ev) => ev.preventDefault()}
      >
        <defs>
          <pattern
            id="journey-dots"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}
          >
            <circle cx="1" cy="1" r="1" className="fill-muted-foreground/25" />
          </pattern>
          <filter id="journey-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35" />
          </filter>
          <marker
            id="journey-start"
            viewBox="-4 -4 8 8"
            markerWidth="6"
            markerHeight="6"
            refX="0"
            refY="0"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <circle r="2.5" fill="context-stroke" />
          </marker>
          <marker
            id="journey-end"
            viewBox="0 0 10 8"
            markerWidth="8"
            markerHeight="6"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,4 L0,8 Z" fill="context-stroke" />
          </marker>
        </defs>
        <rect width={viewport.w} height={viewport.h} fill="url(#journey-dots)" />
        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.k})`}>
          {edges.map((e) => {
            const a = byPath.get(e.from);
            const b = byPath.get(e.to);
            if (!a || !b) return null;
            const aExp = selectedSet.has(a.path) && canExpandNode(a.path);
            const bExp = selectedSet.has(b.path) && canExpandNode(b.path);
            const { hw: aHw } = aExp
              ? expandedNodeBox(
                  a.path === CONVERTED,
                  detailsByPath.get(a.path) ?? null,
                  convertedDetailByPath.get(a.path) ?? null,
                )
              : nodeHalfSize(false);
            const { hw: bHw } = bExp
              ? expandedNodeBox(
                  b.path === CONVERTED,
                  detailsByPath.get(b.path) ?? null,
                  convertedDetailByPath.get(b.path) ?? null,
                )
              : nodeHalfSize(false);
            const isBack = a.x > b.x;
            const pk = `${e.from}->${e.to}${e.dashed ? ":re" : ""}`;
            const idx = pairIndex.get(`${pk}\0${e.country ?? ""}`) ?? 0;
            const bend = (isBack || e.dashed ? -48 : 0) + (colorMode ? idx * -16 : 0);
            const sw = edgeStrokeWidth(e.count, maxCount);
            const key = edgeKey(e);
            const hovered = hoverEdgeKey === key;
            const { stroke, opacity } = edgeTrafficStroke(
              e,
              maxCount,
              colorByCode,
              colorMode,
            );
            const d = cubicEdgePath(a.x, a.y, b.x, b.y, aHw, bHw, bend);
            return (
              <g key={key}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(14, sw + 10)}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    showEdgeTooltip(e, ev.clientX, ev.clientY);
                  }}
                  onPointerMove={(ev) => {
                    ev.stopPropagation();
                    showEdgeTooltip(e, ev.clientX, ev.clientY);
                  }}
                  onPointerLeave={clearEdgeTooltip}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeDasharray={e.dashed ? "6 4" : undefined}
                  markerStart="url(#journey-start)"
                  markerEnd="url(#journey-end)"
                  opacity={hovered ? 1 : opacity}
                  style={{ filter: hovered ? "brightness(1.15)" : undefined }}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {drawOrder.map((n) => {
            const expanded =
              !divePath && selectedSet.has(n.path) && canExpandNode(n.path);
            const isDropOff = n.path === DROP_OFF;
            const isConverted = n.path === CONVERTED;
            const isPort = isDivePort(n.path);
            const isSink = isDropOff || isConverted || isPort;
            const pageDetail = detailsByPath.get(n.path) ?? null;
            const convDetail = convertedDetailByPath.get(n.path) ?? null;
            const box = expanded
              ? expandedNodeBox(isConverted, pageDetail, convDetail)
              : { ...nodeHalfSize(false), digInTop: 0, digInH: 0 };
            const { hw, hh, digInTop, digInH } = box;
            const nodeCursor =
              panning || draggingNode
                ? "cursor-grabbing"
                : spaceDown
                  ? "cursor-grab"
                  : !divePath && canExpandNode(n.path)
                    ? "cursor-pointer"
                    : "cursor-grab";
            return (
              <g
                key={n.path}
                transform={`translate(${n.x}, ${n.y})`}
                className={nodeCursor}
                onPointerDown={(ev) => onNodePointerDown(n.path, ev)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    if (!divePath && canExpandNode(n.path)) {
                      onToggleSelect(n.path);
                    }
                  }
                }}
                filter={expanded ? "url(#journey-shadow)" : undefined}
              >
                <rect
                  x={-hw}
                  y={-hh}
                  width={hw * 2}
                  height={hh * 2}
                  rx={12}
                  className={
                    isDropOff
                      ? "fill-background stroke-destructive/50"
                      : isConverted || isPort
                        ? "fill-muted/40 stroke-muted-foreground/40"
                        : expanded
                          ? "fill-card stroke-foreground/80"
                          : "fill-card stroke-border"
                  }
                  strokeWidth={expanded ? 1.75 : 1}
                />
                {!isSink ? (
                  <rect
                    x={-hw}
                    y={-hh}
                    width={hw * 2}
                    height={28}
                    rx={12}
                    className={expanded ? "fill-muted/55" : "fill-muted/40"}
                  />
                ) : isDropOff ? (
                  <rect
                    x={-hw}
                    y={-hh}
                    width={hw * 2}
                    height={hh * 2}
                    rx={12}
                    className="fill-destructive/5"
                  />
                ) : null}
                {!(isConverted && expanded) ? (
                  <NodeCardBody
                    n={n}
                    hw={hw}
                    hh={hh}
                    selected={expanded}
                    isDropOff={isDropOff}
                    isConverted={isConverted}
                  />
                ) : null}
                {expanded ? (
                  <foreignObject
                    x={-hw + 6}
                    y={-hh + digInTop}
                    width={hw * 2 - 12}
                    height={digInH}
                  >
                    {isConverted ? (
                      <ExpandedConvertedDigIn
                        detail={convDetail}
                        onClose={() => onToggleSelect(n.path)}
                      />
                    ) : (
                      <ExpandedPageDigIn
                        detailPath={n.path}
                        detail={pageDetail}
                        locale={locale}
                        onClose={() => onToggleSelect(n.path)}
                      />
                    )}
                  </foreignObject>
                ) : null}
                {!divePath && !isSink && expandablePaths.includes(n.path) ? (
                  <foreignObject
                    x={hw - 22}
                    y={-hh + 2}
                    width={20}
                    height={20}
                  >
                    <button
                      type="button"
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Dive into sections"
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        onDive(n.path);
                      }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </foreignObject>
                ) : null}
                <circle
                  cx={-hw}
                  cy={0}
                  r={PORT_R}
                  className={
                    isDropOff
                      ? "fill-destructive/70 stroke-background"
                      : isConverted
                        ? "fill-muted-foreground/50 stroke-background"
                        : "fill-muted-foreground stroke-background"
                  }
                  strokeWidth={1.5}
                />
                <circle
                  cx={hw}
                  cy={0}
                  r={PORT_R}
                  className={
                    isDropOff
                      ? "fill-destructive/70 stroke-background"
                      : isConverted
                        ? "fill-muted-foreground/50 stroke-background"
                        : "fill-muted-foreground stroke-background"
                  }
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {tooltipOpen && tooltipData ? (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={edgeTooltipStyles}
        >
          <div className="space-y-1.5">
            <p className="font-medium leading-snug">
              {labelPath(tooltipData.from)}
              <span className="mx-1 text-muted-foreground">→</span>
              {labelPath(tooltipData.to)}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-muted-foreground">Transitions</dt>
              <dd className="tabular-nums font-medium">{tooltipData.count}</dd>
              <dt className="text-muted-foreground">Share</dt>
              <dd className="tabular-nums">{tooltipData.sharePct}%</dd>
              {tooltipData.country ? (
                <>
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="font-mono">{tooltipData.country}</dd>
                </>
              ) : null}
              {tooltipData.dashed ? (
                <>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>Return visit</dd>
                </>
              ) : null}
            </dl>
          </div>
        </TooltipWithBounds>
      ) : null}

      <div className="pointer-events-none absolute bottom-2 left-2 z-30 flex items-center gap-2 rounded-md bg-background/85 px-2 py-1.5 text-[10px] text-muted-foreground shadow-sm">
        <span>Traffic</span>
        <span
          className="inline-block h-1.5 w-16 rounded-full"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklab, var(--chart-3) 22%, var(--muted)), var(--chart-3))",
          }}
          aria-hidden
        />
        <span>less → more</span>
      </div>
    </div>
  );
}

export function ProspectJourneyCard({ from, to }: Props) {
  const { locale } = useI18n();
  const [rawNodes, setRawNodes] = useState<JourneyTransitionNode[]>([]);
  const [rawEdges, setRawEdges] = useState<JourneyTransitionEdge[]>([]);
  const [expandablePaths, setExpandablePaths] = useState<string[]>([]);
  const [entrySources, setEntrySources] = useState<string[]>([]);
  const [entrySource, setEntrySource] = useState<string>(ALL);
  const [visitorCohort, setVisitorCohort] = useState<string>(ALL);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryLegend, setCountryLegend] = useState<
    { code: string; color: string }[]
  >([]);
  const [divePath, setDivePath] = useState<string | null>(null);
  const [detailPaths, setDetailPaths] = useState<string[]>([]);
  const [detailsByPath, setDetailsByPath] = useState<Map<string, JourneyNodeDetail>>(
    () => new Map(),
  );
  const [convertedDetailByPath, setConvertedDetailByPath] = useState<
    Map<string, JourneyConvertedDetail>
  >(() => new Map());
  const [includeConverted, setIncludeConverted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterArgs = useMemo(
    () => ({
      entrySource: entrySource === ALL ? null : entrySource,
      visitorCohort: (visitorCohort === "new" || visitorCohort === "returning"
        ? visitorCohort
        : null) as "new" | "returning" | null,
      countries: selectedCountries.length > 0 ? selectedCountries : null,
      includeConverted,
    }),
    [entrySource, visitorCohort, selectedCountries, includeConverted],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProspectJourneyTransitions({
        from,
        to,
        ...filterArgs,
        // When diving, fetch expanded section children; page view stays page-only.
        expandPath: divePath,
      });
      if (!res.ok) {
        setError(res.error);
        setRawNodes([]);
        setRawEdges([]);
        setExpandablePaths([]);
        setCountryLegend([]);
        return;
      }
      setRawNodes(res.nodes);
      setRawEdges(res.edges);
      setExpandablePaths(res.expandablePaths);
      setEntrySources(res.entrySources);
      setCountryOptions(res.countries);
      setCountryLegend(res.countryLegend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRawNodes([]);
      setRawEdges([]);
      setExpandablePaths([]);
      setCountryLegend([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, filterArgs, divePath]);

  useEffect(() => {
    void load();
  }, [load]);

  const { nodes, edges } = useMemo(() => {
    if (divePath) return toDiveDisplay(divePath, rawNodes, rawEdges);
    return {
      nodes: rawNodes.filter(
        (n) => !isSectionChildPath(n.path) && !isDivePort(n.path),
      ),
      edges: rawEdges.filter(
        (e) => !isSectionChildPath(e.from) && !isSectionChildPath(e.to),
      ),
    };
  }, [divePath, rawNodes, rawEdges]);

  // Dig-in fetch separate from graph — node click must not reload nodes/edges.
  useEffect(() => {
    const paths = detailPaths.filter((p) => canExpandNode(p));
    if (paths.length === 0) {
      setDetailsByPath(new Map());
      setConvertedDetailByPath(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(
      paths.map((path) =>
        getProspectJourneyNodeDetail({ path, from, to, ...filterArgs }).then(
          (res) => ({ path, res }),
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const nextDetails = new Map<string, JourneyNodeDetail>();
      const nextConverted = new Map<string, JourneyConvertedDetail>();
      for (const { path, res } of results) {
        if (!res.ok) continue;
        if (res.detail) nextDetails.set(path, res.detail);
        if (res.convertedDetail) nextConverted.set(path, res.convertedDetail);
      }
      setDetailsByPath(nextDetails);
      setConvertedDetailByPath(nextConverted);
    });
    return () => {
      cancelled = true;
    };
  }, [detailPaths, from, to, filterArgs]);

  function onDive(path: string) {
    setDetailPaths([]);
    setDivePath(path);
  }

  function onExitDive() {
    setDivePath(null);
  }

  function onToggleSelect(path: string) {
    if (!canExpandNode(path)) return;
    setDetailPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
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

  const filterBar = (
    <>
      <label htmlFor="entry-source-filter" className="sr-only">
        Entry source
      </label>
      <Select value={entrySource} onValueChange={setEntrySource}>
        <SelectTrigger
          id="entry-source-filter"
          className="h-8 w-[140px] min-h-8 text-xs sm:w-[180px]"
        >
          <SelectValue placeholder="Entry source" />
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
      <label htmlFor="visitor-cohort-filter" className="sr-only">
        Visitors
      </label>
      <Select value={visitorCohort} onValueChange={setVisitorCohort}>
        <SelectTrigger
          id="visitor-cohort-filter"
          className="h-8 w-[110px] min-h-8 text-xs sm:w-[130px]"
        >
          <SelectValue placeholder="Visitors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All visitors</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="returning">Returning</SelectItem>
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-h-8 min-w-0 justify-between font-normal text-xs sm:min-w-[120px]"
            aria-label="Filter countries"
          >
            {selectedCountries.length === 0
              ? "All countries"
              : selectedCountries.length === 1
                ? selectedCountries[0]
                : `${selectedCountries.length} countries`}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
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
      <div className="flex items-center gap-1.5 px-1">
        <Switch
          id="include-converted"
          checked={includeConverted}
          onCheckedChange={setIncludeConverted}
        />
        <Label
          htmlFor="include-converted"
          className="text-[11px] font-medium text-muted-foreground"
        >
          Include converted
        </Label>
      </div>
    </>
  );

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 py-3">
        <CardTitle className="text-base font-medium">Prospect journey</CardTitle>
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
      <CardContent className="p-0">
        {loading ? (
          <Skeleton className="h-[min(80vh,860px)] w-full rounded-none" />
        ) : error ? (
          <p className="px-4 py-3 text-sm text-destructive">{error}</p>
        ) : rawNodes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No page views in this range yet. Browse the storefront to generate transitions.
          </p>
        ) : (
          <div className="relative">
            <JourneyGraph
              nodes={nodes}
              edges={edges}
              selectedPaths={detailPaths}
              onToggleSelect={onToggleSelect}
              onClearSelection={() => setDetailPaths([])}
              colorByCode={colorByCode}
              detailsByPath={detailsByPath}
              convertedDetailByPath={convertedDetailByPath}
              locale={locale}
              divePath={divePath}
              expandablePaths={expandablePaths}
              onDive={onDive}
              onExitDive={onExitDive}
              filterBar={filterBar}
            />
            {countryLegend.length >= 2 ? (
              <ul
                className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex flex-wrap gap-3 rounded-md border bg-background/95 px-2 py-1.5 text-xs shadow-sm"
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
                <li className="text-muted-foreground">Opacity scales with traffic</li>
              </ul>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
