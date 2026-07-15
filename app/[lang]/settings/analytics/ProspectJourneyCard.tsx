"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Scan,
  X,
} from "lucide-react";
import { edgeStrokeWidth } from "@/lib/analytics/journey/chrome";
import { CONVERTED_NODE } from "@/lib/analytics/journey/converted-sink";
import {
  getProspectJourneyTransitions,
  type JourneyConvertedDetail,
  type JourneyNodeDetail,
  type JourneySectionNode,
  type JourneyTransitionEdge,
  type JourneyTransitionNode,
} from "./actions";

type Props = { from: string; to: string };

const ALL = "__all__";
const DROP_OFF = "__drop_off__";
const CONVERTED = CONVERTED_NODE;
const LAYOUT_KEY = "prospect-journey-layout-v1";
const DRAG_THRESHOLD = 4;
const PORT_R = 4;
const NODE_W = 140;
const NODE_H = 76;
const NODE_W_SEL = 200;
const NODE_H_SEL = 120;
const WORLD_W = 640;
const WORLD_H = 400;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const PAN_NUDGE = 40;

function labelPath(path: string) {
  if (path === DROP_OFF) return "Drop-off";
  if (path === CONVERTED) return "Converted";
  const hash = path.indexOf("#");
  if (hash >= 0) return `${path.slice(0, hash)} › ${path.slice(hash + 1)}`;
  return path === "/" ? "Home" : path;
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

function layoutGraph(
  nodes: JourneyTransitionNode[],
  width: number,
  height: number,
): LayoutNode[] {
  const dropOffSink = nodes.find((n) => n.path === DROP_OFF);
  const convertedSink = nodes.find((n) => n.path === CONVERTED);
  const pages = nodes.filter((n) => n.path !== DROP_OFF && n.path !== CONVERTED);
  const cx = width * 0.42;
  const cy = height * 0.5;
  const r = Math.min(width, height) * 0.32;
  const laid: LayoutNode[] = pages.map((n, i) => {
    const angle = pages.length === 1 ? -Math.PI / 2 : (i / pages.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  const sinkX = width * 0.88;
  if (dropOffSink && convertedSink) {
    laid.push({ ...dropOffSink, x: sinkX, y: cy - 52 });
    laid.push({ ...convertedSink, x: sinkX, y: cy + 52 });
  } else if (dropOffSink) {
    laid.push({ ...dropOffSink, x: sinkX, y: cy });
  } else if (convertedSink) {
    laid.push({ ...convertedSink, x: sinkX, y: cy });
  }
  return laid;
}

function loadPositions(): PosMap {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PosMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePositions(pos: PosMap) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(pos));
  } catch {
    /* ponytail: quota/private mode — layout just won't persist */
  }
}

function nodeHalfSize(selected: boolean) {
  return selected
    ? { hw: NODE_W_SEL / 2, hh: NODE_H_SEL / 2 }
    : { hw: NODE_W / 2, hh: NODE_H / 2 };
}

function fitCamera(laid: LayoutNode[], vw: number, vh: number, pad = 48): Camera {
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

function DetailPanel({
  detailPath,
  detail,
  open,
  onClose,
}: {
  detailPath: string;
  detail: JourneyNodeDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`absolute inset-y-0 right-0 z-20 flex w-[min(360px,90%)] flex-col border-l bg-card/95 shadow-sm backdrop-blur transition-transform duration-200 ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{labelPath(detailPath)}</h3>
          <p className="text-xs text-muted-foreground">
            Exit sections, dwell, and sample Visit paths
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
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
    </aside>
  );
}

function ConvertedDetailPanel({
  detail,
  open,
  onClose,
}: {
  detail: JourneyConvertedDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`absolute inset-y-0 right-0 z-20 flex w-[min(360px,90%)] flex-col border-l bg-card/95 shadow-sm backdrop-blur transition-transform duration-200 ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">Converted</h3>
          <p className="text-xs text-muted-foreground">
            Last-touch Entry source, journey duration, order value, and page path
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-4 py-3 text-sm">
        {!detail ? (
          <p className="text-muted-foreground">Loading detail…</p>
        ) : detail.count === 0 ? (
          <p className="text-muted-foreground">No paid orders linked in this range.</p>
        ) : (
          <>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <p>
                {detail.count} orders · {formatValue(detail.totalValue)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Last-touch Entry source
              </p>
              {detail.byEntrySource.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {detail.byEntrySource.map((s) => (
                    <li key={s.entrySource} className="flex justify-between gap-2">
                      <span>{s.entrySource}</span>
                      <span className="text-muted-foreground">
                        {s.count} · {formatValue(s.totalValue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sample conversions
              </p>
              <ul className="space-y-2 text-xs">
                {detail.samples.map((s, i) => (
                  <li key={i} className="rounded border p-2">
                    <p className="font-medium">{s.entrySource}</p>
                    <p className="text-muted-foreground">
                      {formatValue(s.orderValue)} · {formatDwell(s.journeyDurationMs)}
                    </p>
                    <p className="mt-1 truncate font-mono text-muted-foreground">
                      {s.shortPath.map(labelPath).join(" → ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function JourneyGraph({
  nodes,
  edges,
  selectedPath,
  onSelect,
  colorByCode,
  detail,
  convertedDetail,
}: {
  nodes: JourneyTransitionNode[];
  edges: JourneyTransitionEdge[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  colorByCode: Map<string, string>;
  detail: JourneyNodeDetail | null;
  convertedDetail: JourneyConvertedDetail | null;
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
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

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
    setOverrides(loadPositions());
    setFittedKey(""); // refit after persisted positions apply
  }, []);

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

  const seeded = useMemo(() => layoutGraph(nodes, WORLD_W, WORLD_H), [nodes]);
  const laid = useMemo(() => {
    return seeded.map((n) => {
      const o = overrides[n.path];
      return o ? { ...n, x: o.x, y: o.y } : n;
    });
  }, [seeded, overrides]);
  const byPath = useMemo(() => new Map(laid.map((n) => [n.path, n])), [laid]);
  const maxCount = Math.max(1, ...edges.map((e) => e.count));
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
      d.moved = true;
      setOverrides((prev) => {
        const next = { ...prev, [d.path]: { x: d.origX + dx, y: d.origY + dy } };
        savePositions(next);
        return next;
      });
    },
    [clientToWorld],
  );

  const onNodePointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener("pointermove", onNodePointerMove);
    window.removeEventListener("pointerup", onNodePointerUp);
    if (!d) return;
    if (!d.moved && d.path !== DROP_OFF) onSelect(d.path);
  }, [onNodePointerMove, onSelect]);

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
    if (ev.button === 0) onSelect(null);
  }

  function fitView() {
    setCamera(fitCamera(laid, viewport.w, viewport.h));
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
        if (selectedPath) {
          onSelect(null);
          return;
        }
        if (fullscreen) setFullscreen(false);
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
  }, [fullscreen, onSelect, selectedPath]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const drawOrder = useMemo(() => {
    const rest = laid.filter((n) => n.path !== selectedPath);
    const sel = laid.find((n) => n.path === selectedPath);
    return sel ? [...rest, sel] : rest;
  }, [laid, selectedPath]);

  const cursorClass = panning
    ? "cursor-grabbing"
    : spaceDown
      ? "cursor-grab"
      : "cursor-default";

  const shellClass = fullscreen
    ? `fixed inset-0 z-50 flex flex-col bg-background ${cursorClass}`
    : `relative h-[min(70vh,720px)] w-full overflow-hidden rounded-md border bg-muted/30 ${cursorClass}`;

  return (
    <div ref={shellRef} className={shellClass} tabIndex={0}>
      <div className="pointer-events-none absolute left-2 top-2 z-30 flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pointer-events-auto h-8 gap-1.5 text-xs shadow-sm"
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
          className="pointer-events-auto h-8 gap-1.5 text-xs shadow-sm"
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
        <span className="pointer-events-none ml-1 hidden rounded bg-background/80 px-2 py-1 text-[10px] text-muted-foreground sm:inline">
          Space/MMB pan · wheel zoom · F fullscreen · Esc close
        </span>
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
            const aSel = selectedPath === a.path;
            const bSel = selectedPath === b.path;
            const { hw: aHw } = nodeHalfSize(aSel);
            const { hw: bHw } = nodeHalfSize(bSel);
            const isBack = a.x > b.x;
            const pk = `${e.from}->${e.to}${e.dashed ? ":re" : ""}`;
            const idx = pairIndex.get(`${pk}\0${e.country ?? ""}`) ?? 0;
            const bend = (isBack || e.dashed ? -48 : 0) + (colorMode ? idx * -16 : 0);
            const sw = edgeStrokeWidth(e.count, maxCount);
            const stroke =
              colorMode && e.country && colorByCode.has(e.country)
                ? colorByCode.get(e.country)!
                : undefined;
            return (
              <path
                key={`${e.from}->${e.to}:${e.country ?? ""}:${e.dashed ? "re" : "s"}`}
                d={cubicEdgePath(a.x, a.y, b.x, b.y, aHw, bHw, bend)}
                fill="none"
                stroke={stroke ?? "currentColor"}
                className={
                  stroke
                    ? undefined
                    : e.dashed
                      ? "text-muted-foreground/45"
                      : "text-muted-foreground/60"
                }
                strokeWidth={sw}
                strokeDasharray={e.dashed ? "6 4" : undefined}
                markerStart="url(#journey-start)"
                markerEnd="url(#journey-end)"
                opacity={stroke ? 0.85 : undefined}
                pointerEvents="none"
              />
            );
          })}
          {drawOrder.map((n) => {
            const selected = selectedPath === n.path;
            const isDropOff = n.path === DROP_OFF;
            const isConverted = n.path === CONVERTED;
            const isSink = isDropOff || isConverted;
            const { hw, hh } = nodeHalfSize(selected && !isSink);
            const headerH = selected && !isSink ? 28 : 22;
            const titleMax = selected ? 28 : 18;
            const title = labelPath(n.path);
            return (
              <g
                key={n.path}
                transform={`translate(${n.x}, ${n.y})`}
                className={spaceDown ? "cursor-grab" : "cursor-grab active:cursor-grabbing"}
                onPointerDown={(ev) => onNodePointerDown(n.path, ev)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    if (n.path !== DROP_OFF) onSelect(n.path);
                  }
                }}
                filter={selected ? "url(#journey-shadow)" : undefined}
              >
                <rect
                  x={-hw}
                  y={-hh}
                  width={hw * 2}
                  height={hh * 2}
                  rx={8}
                  className={
                    isDropOff
                      ? "fill-background stroke-destructive/60"
                      : isConverted
                        ? "fill-muted/30 stroke-muted-foreground/50"
                        : selected
                          ? "fill-background stroke-foreground"
                          : "fill-background stroke-border"
                  }
                  strokeWidth={selected ? 2 : 1}
                />
                <rect
                  x={-hw}
                  y={-hh}
                  width={hw * 2}
                  height={headerH}
                  rx={8}
                  className={
                    isDropOff
                      ? "fill-destructive/15"
                      : isConverted
                        ? "fill-muted/40"
                        : selected
                          ? "fill-muted"
                          : "fill-muted/60"
                  }
                />
                <rect
                  x={-hw}
                  y={-hh + headerH - 8}
                  width={hw * 2}
                  height={8}
                  className={
                    isDropOff
                      ? "fill-destructive/15"
                      : isConverted
                        ? "fill-muted/40"
                        : selected
                          ? "fill-muted"
                          : "fill-muted/60"
                  }
                />
                <SvgText
                  y={-hh + headerH / 2 + 4}
                  maxChars={titleMax}
                  className={
                    isConverted
                      ? "fill-muted-foreground text-[11px] font-medium"
                      : "fill-foreground text-[11px] font-medium"
                  }
                >
                  {title}
                </SvgText>
                {!isSink ? (
                  selected ? (
                    <>
                      <SvgText
                        y={-hh + headerH + 18}
                        maxChars={32}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {`${n.prospects} prospects · ${n.dropOffPct}% drop`}
                      </SvgText>
                      <SvgText
                        y={-hh + headerH + 36}
                        maxChars={32}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {`dwell ${formatDwell(n.medianDwellMs)}${
                          n.topDropOffSection ? ` · #${n.topDropOffSection}` : ""
                        }`}
                      </SvgText>
                      <SvgText
                        y={-hh + headerH + 54}
                        maxChars={32}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {n.returnHits > 0
                          ? `returns ${n.returnHits}${
                              n.medianReturnGapMs != null
                                ? ` · gap ${formatGap(n.medianReturnGapMs)}`
                                : ""
                            }`
                          : "returns 0"}
                      </SvgText>
                      <SvgText
                        y={-hh + headerH + 72}
                        maxChars={28}
                        className="fill-muted-foreground/80 text-[9px]"
                      >
                        {`${n.views} views`}
                      </SvgText>
                    </>
                  ) : (
                    <>
                      <SvgText
                        y={-hh + headerH + 14}
                        maxChars={22}
                        className="fill-muted-foreground text-[9px]"
                      >
                        {`${n.prospects} prospects · ${n.dropOffPct}% drop`}
                      </SvgText>
                      <SvgText
                        y={-hh + headerH + 28}
                        maxChars={22}
                        className="fill-muted-foreground text-[9px]"
                      >
                        {`dwell ${formatDwell(n.medianDwellMs)}${
                          n.topDropOffSection ? ` · #${n.topDropOffSection}` : ""
                        }`}
                      </SvgText>
                      <SvgText
                        y={-hh + headerH + 42}
                        maxChars={22}
                        className="fill-muted-foreground text-[8px]"
                      >
                        {n.returnHits > 0
                          ? `returns ${n.returnHits}${
                              n.medianReturnGapMs != null
                                ? ` · gap ${formatGap(n.medianReturnGapMs)}`
                                : ""
                            }`
                          : "returns 0"}
                      </SvgText>
                    </>
                  )
                ) : (
                  <SvgText y={4} maxChars={18} className="fill-muted-foreground text-[10px]">
                    {isConverted ? `${n.views} orders` : `${n.views} visits`}
                  </SvgText>
                )}
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

      {selectedPath === CONVERTED ? (
        <ConvertedDetailPanel
          detail={convertedDetail}
          open
          onClose={() => onSelect(null)}
        />
      ) : selectedPath && selectedPath !== DROP_OFF ? (
        <DetailPanel
          detailPath={selectedPath}
          detail={detail}
          open
          onClose={() => onSelect(null)}
        />
      ) : null}
    </div>
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
  const [includeConverted, setIncludeConverted] = useState(false);
  const [convertedDetail, setConvertedDetail] = useState<JourneyConvertedDetail | null>(null);
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
        includeConverted,
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
        setConvertedDetail(null);
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
      setConvertedDetail(res.convertedDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setNodes([]);
      setEdges([]);
      setSections([]);
      setExpandablePaths([]);
      setDetail(null);
      setConvertedDetail(null);
      setCountryLegend([]);
    } finally {
      setLoading(false);
    }
  }, [
    from,
    to,
    entrySource,
    visitorCohort,
    selectedCountries,
    includeConverted,
    expandPath,
    detailPath,
  ]);

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
          <div className="flex items-center gap-2">
            <Switch
              id="include-converted"
              checked={includeConverted}
              onCheckedChange={setIncludeConverted}
            />
            <Label htmlFor="include-converted" className="text-xs font-medium text-muted-foreground">
              Include converted
            </Label>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-[min(70vh,720px)] w-full" />
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
              detail={detail}
              convertedDetail={convertedDetail}
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
    </Card>
  );
}
