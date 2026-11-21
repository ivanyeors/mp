"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertTriangle, FlipHorizontal2, GripVertical, Layers, Plus, Trash2, X } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

import { SunburstMenu } from "@/components/ui/sunburst-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { layerDragDestination, layerSortableId } from "@/lib/dnd/layer-drag";
import type { SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { fillingItemsToSunburst, fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import {
  addPiece,
  cellArrangement,
  cellLayers,
  cellPieces,
  mirrorSection,
  mirrorTarget,
  moveLayer,
  movePiece,
  nudgePiece,
  removeLayer,
  removePiece,
  reorderedRef,
  reorderInLayer,
  setCellArrangement,
  shiftPieceLayer,
  type Cell,
  type MoveResult,
  type PieceRef,
} from "@/lib/configurator/staff-assist";
import { isTypingTarget, moveKeyFor, nudgeKeyFor, type MoveKind } from "@/lib/configurator/move-keys";
import { dropIndex, dropTargetFromElement, planPouchDrop, type PouchDropTarget } from "@/lib/dnd/pouch-drag";
import {
  MAX_LAYERS_PER_CELL,
  MAX_PIECES_PER_CELL,
  MAX_PIECES_PER_LAYER,
  SECTIONS,
  SUB_SECTIONS,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "@/lib/spatial-fillings/core";
import {
  conformPouchPath,
  labelRectOf,
  makeRegion,
  parsePathPolygon,
  type ConformRegion,
} from "@/lib/spatial-fillings/conform";
import { getShapeMorph, prepareMorph } from "@/lib/spatial-fillings/morphs";
import { fillingVisual, type FillingVisual } from "@/lib/spatial-fillings/visuals";
import {
  fitMessage,
  fitPillow,
  layerFitMessage,
  pieceFitStatus,
  type CellFit,
  type FitStatus,
  type PieceFitStatus,
  type PillowFit,
} from "@/lib/spatial-fillings/fit";
import { layoutPlacements, type PieceLayout, type PieceRect } from "@/lib/spatial-fillings/xray-layout";
import { alongExtent, homeCentreMm, nudgeSlab, placeAlongAt, snapAlongCentre, type AlongSnap } from "@/lib/dnd/slab-drag";
import type { FineDrag, Vec } from "@/lib/dnd/fine-drag";
import { settlePillow } from "@/lib/spatial-fillings/settle";
import { stageGeometry, type StageGeometry } from "@/lib/spatial-fillings/xray-stage";
import { PILLOW_DIMENSIONS, sizeFactors, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { draftSoftBody, HELD_EASE_MS, padWellOf, SOFT_BODY_DEFAULTS, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { FILLING_SHAPE_PATHS, SHELL_SEAM, XRAY_VIEW, type CellKey } from "./xray-assets";
import { topPlanes, useSoftTopPaths } from "./soft-top";
import { acrossText, landingText } from "./drag-badge";
import { badgeFontFor, buzz, HeldGhost, pastThreshold, pickUp, stepHold, svgScale, useHeldGhost } from "./held-pouch";
import { clearXrayDraft, placementsSignature, publishXrayDraft, useXrayDraft, type XrayDraft } from "./xray-link";

type StageRegions = {
  sil: ConformRegion;
  sections: Record<Section, ConformRegion>;
};
const WALL_SEAM = 0.5;
const REGIONS_BY_SIZE = new Map<PillowSize, StageRegions>();
export function stageRegions(stage: StageGeometry): StageRegions {
  let regions = REGIONS_BY_SIZE.get(stage.size);
  if (!regions) {
    regions = {
      sil: makeRegion(stage.silhouettePolygon, SHELL_SEAM),
      sections: Object.fromEntries(
        (Object.entries(stage.sectionPolygons) as Array<[Section, StageGeometry["silhouettePolygon"]]>).map(
          ([section, poly]) => [section, makeRegion(poly, WALL_SEAM)],
        ),
      ) as Record<Section, ConformRegion>,
    };
    REGIONS_BY_SIZE.set(stage.size, regions);
  }
  return regions;
}

export type PieceView = "authored" | "settled";

const isNudged = (p: PieceLayout) => p.nudged;

function bySection(pieces: readonly PieceLayout[]): Map<Section, PieceLayout[]> {
  const out = new Map<Section, PieceLayout[]>();
  for (const section of SECTIONS) {
    const list = pieces.filter((p) => p.section === section);
    if (list.length === 0) continue;
    list.sort(
      (a, b) =>
        a.level - b.level ||
        b.depth - a.depth ||
        SUB_SECTIONS.indexOf(a.subSection) - SUB_SECTIONS.indexOf(b.subSection) ||
        a.slot - b.slot,
    );
    out.set(section, list);
  }
  return out;
}

function withSoft(conformed: Map<string, string>, soft: ReadonlyMap<string, string> | null): Map<string, string> {
  if (!soft) return conformed;
  const out = new Map(conformed);
  for (const [key, d] of soft) if (out.has(key) && d) out.set(key, d);
  return out;
}

const isSpread = (p: PieceLayout) => p.settled.y !== p.y || p.settled.h !== p.h;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MORPH_MS = 320;

export const XRAY_SHELL = "var(--xray-shell, rgba(255,255,255,0.9))";
export const XRAY_INTERIOR = "var(--xray-interior, rgba(15,23,42,0.5))";
const XRAY_VEIL = "var(--xray-veil, rgb(2,6,23))";
const AMBER = "#f59e0b";
const REMOVE_RED = "var(--destructive, rgb(220,38,38))";
const REMOVE_MARGIN_PX = 24;
const removeChipTransform = (clientX: number, clientY: number) => `translate(${clientX + 16}px, ${clientY + 16}px)`;
const RELAXED_PIECE: PieceFitStatus = { status: "ok", widthRatio: 1, thicknessRatio: 1 };
type PouchDrag = {
  source: PieceRef & { depth: number; itemId: number };
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  ghostD: string | null;
  drawnCx: number;
  drawnCy: number;
  alongShift: number;
  x: number;
  y: number;
  fine: FineDrag;
  snapView: number;
  active: boolean;
  over: PouchDropTarget | null;
  overfull: boolean;
  halfH: number;
  pxPerView: number;
  planAt: Vec;
  planKey: string;
  clientX: number;
  clientY: number;
  removing: boolean;
};
const sameRef = (p: PieceRef, q: PieceRef) => p.section === q.section && p.subSection === q.subSection && p.slot === q.slot;
const sameCellRef = (p: Cell, q: Cell) => p.section === q.section && p.subSection === q.subSection;

export const CHIP_CLASS = "rounded border bg-background/90 shadow-sm text-[9px] leading-4 max-md:text-[11px] max-md:leading-5 md:dock:text-sm md:dock:leading-6";
export const CHIP_ICON_CLASS = "size-2.5 max-md:size-3.5 md:dock:size-4";
export const CHIP_ICON_BUTTON_CLASS = "shrink-0 rounded max-md:flex max-md:size-7 max-md:items-center max-md:justify-center md:dock:flex md:dock:size-8 md:dock:items-center md:dock:justify-center";

const LAYER_ROW_CLASS =
  "rounded-md border bg-background/95 shadow-sm text-[10px] leading-4 max-md:text-[13px] max-md:leading-6 md:dock:text-sm md:dock:leading-7";
const LAYER_ICON_CLASS = "size-3 max-md:size-4 md:dock:size-4";
const LAYER_ICON_BUTTON_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded max-md:size-11 md:dock:size-9";
export const SLOTTED_BLOOM_PX = 300;
const easeOut = (t: number) => t * (2 - t);

export function earWellCircle(d: string, share: number): { cx: number; cy: number; r: number } | null {
  if (share <= 0) return null;
  const P = parsePathPolygon(d, 4);
  if (P.length < 3) return null;
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i];
    const [bx, by] = P[(i + 1) % P.length];
    const c = ax * by - bx * ay;
    a2 += c;
    cx += (ax + bx) * c;
    cy += (ay + by) * c;
    x0 = Math.min(x0, ax);
    x1 = Math.max(x1, ax);
    y0 = Math.min(y0, ay);
    y1 = Math.max(y1, ay);
  }
  if (Math.abs(a2) < 1e-6) return null;
  const r = Math.min((share * (x1 - x0)) / 2, 0.4 * Math.min(x1 - x0, y1 - y0));
  return r >= 2 ? { cx: cx / (3 * a2), cy: cy / (3 * a2), r } : null;
}

const circlePath = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => {
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
};

// ponytail: swap morphs interpolate the normalized asset shapes, not the conformed outline, so
// callers key a piece by its shape and a pouch↔pill swap remounts instead of morphing. Rebase the
// morphs through conformPouchPath before animating a swap.
export const MorphPiece = memo(MorphPieceImpl, (a, b) =>
  a.subtype === b.subtype &&
  a.d === b.d &&
  a.view === b.view &&
  a.status === b.status &&
  a.well === b.well &&
  a.visual.shape === b.visual.shape &&
  a.visual.cssVar === b.visual.cssVar &&
  a.visual.defaultColor === b.visual.defaultColor,
);

function MorphPieceImpl({
  subtype,
  visual,
  d,
  view = "settled",
  status = "ok",
  well = 0,
}: {
  subtype: string | null;
  visual: FillingVisual;
  d: string;
  view?: PieceView;
  status?: FitStatus;
  well?: number;
}) {
  const shape = visual.shape;
  const ref = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  const prevShape = useRef(shape);
  const [ghost, setGhost] = useState<typeof shape | null>(null);
  const prevView = useRef(view);
  const prevD = useRef(d);
  const settleGhostRef = useRef<SVGPathElement>(null);
  const [settleGhost, setSettleGhost] = useState<string | null>(null);

  useIsoLayoutEffect(() => {
    const from = prevShape.current;
    prevShape.current = shape;
    const el = ref.current;
    if (from === shape || !el) return;
    const morph = getShapeMorph(from, shape);
    if (!morph) return;
    let raf = 0;
    const t0 = performance.now();
    if (!morph.crossfade) {
      // ponytail: an interrupted morph restarts from the last *shape*, not the
      // mid-flight frame — prepared pairs only (guardrail 4), no ad hoc interps.
      el.setAttribute("d", morph.interpolator(0));
      const tick = (now: number) => {
        const t = Math.min((now - t0) / MORPH_MS, 1);
        el.setAttribute("d", t < 1 ? morph.interpolator(easeOut(t)) : FILLING_SHAPE_PATHS[shape]);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      el.setAttribute("fill-opacity", "0");
      el.setAttribute("stroke-opacity", "0");
      setGhost(from);
      const tick = (now: number) => {
        const t = Math.min((now - t0) / MORPH_MS, 1);
        el.setAttribute("fill-opacity", String(0.9 * t));
        el.setAttribute("stroke-opacity", String(t));
        ghostRef.current?.setAttribute("fill-opacity", String(0.9 * (1 - t)));
        ghostRef.current?.setAttribute("stroke-opacity", String(1 - t));
        if (t < 1) raf = requestAnimationFrame(tick);
        else setGhost(null);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, [shape]);

  useIsoLayoutEffect(() => {
    const fromView = prevView.current;
    const fromD = prevD.current;
    prevView.current = view;
    prevD.current = d;
    const el = ref.current;
    if (fromView === view || fromD === d || !el) return;
    const morph = prepareMorph(fromD, d);
    let raf = 0;
    const t0 = performance.now();
    if (!morph.crossfade) {
      el.setAttribute("d", morph.interpolator(0));
      const tick = (now: number) => {
        const t = Math.min((now - t0) / MORPH_MS, 1);
        el.setAttribute("d", t < 1 ? morph.interpolator(easeOut(t)) : d);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      el.setAttribute("fill-opacity", "0");
      el.setAttribute("stroke-opacity", "0");
      setSettleGhost(fromD);
      const tick = (now: number) => {
        const t = Math.min((now - t0) / MORPH_MS, 1);
        el.setAttribute("fill-opacity", String(0.9 * t));
        el.setAttribute("stroke-opacity", String(t));
        settleGhostRef.current?.setAttribute("fill-opacity", String(0.9 * (1 - t)));
        settleGhostRef.current?.setAttribute("stroke-opacity", String(1 - t));
        if (t < 1) raf = requestAnimationFrame(tick);
        else setSettleGhost(null);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (morph.crossfade) {
        el.setAttribute("fill-opacity", "0.9");
        el.removeAttribute("stroke-opacity");
        setSettleGhost(null);
      }
    };
  }, [view, d]);

  const paint = {
    "data-item-subtype": subtype ?? "",
    fill: `var(${visual.cssVar}, ${visual.defaultColor})`,
    fillOpacity: 0.9,
    stroke: "rgba(255,255,255,0.9)",
    strokeWidth: 2,
    strokeDasharray: status === "ok" ? undefined : "6 3",
    vectorEffect: "non-scaling-stroke",
  } as const;

  const wellAt = visual.shape === "ear" ? earWellCircle(d, well) : null;

  return (
    <>
      {ghost && <path ref={ghostRef} d={d} {...paint} />}
      {settleGhost && <path ref={settleGhostRef} d={settleGhost} {...paint} />}
      <path ref={ref} d={d} {...paint} />
      {wellAt && (
        <path
          d={circlePath(wellAt)}
          data-ear-well=""
          fill="rgb(2,6,23)"
          fillOpacity={0.22}
          stroke="rgba(255,255,255,0.8)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </>
  );
}

function CellFitNote({ cell, size, className = "" }: { cell: CellFit; size: string; className?: string }) {
  return <FitNote status={cell.status} message={fitMessage(cell, size)} className={className} data-xray-cell-fit={cell.status} />;
}

export function FitNote({
  status,
  message,
  className = "",
  ...data
}: {
  status: FitStatus;
  message: string;
  className?: string;
} & { [attr: `data-${string}`]: string }) {
  if (status === "ok") return null;
  return (
    <span className={`flex items-center gap-1 font-medium capitalize ${FIT_TONE[status]} ${className}`} {...data}>
      <FitWarning status={status} message={message} />
      {status}
    </span>
  );
}

const FIT_TONE: Record<Exclude<FitStatus, "ok">, string> = {
  compressed: "text-amber-600 dark:text-amber-400",
  over: "text-amber-600 dark:text-amber-400",
};

export function FitWarning({
  status,
  message,
  className = "",
}: {
  status: FitStatus;
  message: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (status === "ok") return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`pointer-events-auto inline-flex shrink-0 items-center justify-center rounded ${FIT_TONE[status]} ${className}`}
          aria-label={message}
          data-fit-warning={status}
          onClick={() => setOpen((o) => !o)}
        >
          <AlertTriangle className="size-3 max-md:size-3.5 md:dock:size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        {message}
      </TooltipContent>
    </Tooltip>
  );
}

export function PieceLabel({ rect, lines }: { rect: PieceRect; lines: string[] }) {
  const isMobile = useIsMobile();
  if (lines.length === 0) return null;
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(
    isMobile ? 20 : 13,
    (rect.w - 6) / (longest * 0.62),
    (rect.h - 4) / (lines.length * 1.15),
  );
  if (size < 7) return null;
  const cx = rect.x + rect.w / 2;
  const top = rect.y + rect.h / 2 - ((lines.length - 1) * size * 1.1) / 2;
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={600}
      fill="white"
      stroke="rgba(2,6,23,0.8)"
      strokeWidth={size * 0.2}
      strokeLinejoin="round"
      paintOrder="stroke"
      className="select-none"
      style={{ pointerEvents: "none" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={cx} y={top + i * size * 1.1}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function LayerRow({
  id,
  index,
  depth,
  dropCell,
  pieces,
  full,
  warning,
  selectedSlot,
  onAdd,
  onRemoveLayer,
  onRemovePiece,
  onSelectPiece,
  pieceDragHandle,
}: {
  id: string;
  index: number;
  depth: number;
  dropCell: string;
  pieces: Array<{ slot: number; label: string }>;
  full: boolean;
  warning?: { status: FitStatus; message: string };
  selectedSlot: number | null;
  onAdd: () => void;
  onRemoveLayer: () => void;
  onRemovePiece: (slot: number) => void;
  onSelectPiece: (slot: number) => void;
  pieceDragHandle: (slot: number) => React.DOMAttributes<Element>;
}) {
  const { ref, isDragging, handleRef } = useSortable<HTMLDivElement>({ id, index });
  return (
    <div
      ref={ref}
      data-drop-cell={dropCell}
      data-drop-layer={depth}
      className={`pointer-events-auto flex w-full items-center gap-1 px-1 max-md:gap-1.5 max-md:px-1.5 md:dock:gap-1.5 md:dock:px-2 ${LAYER_ROW_CLASS} ${isDragging ? "z-50 opacity-70 shadow-lg" : ""}`}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">{depth + 1}</span>
      {warning && <FitWarning status={warning.status} message={warning.message} />}
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:flex-wrap">
        {pieces.map((piece) => (
          <span
            key={piece.slot}
            className={`flex min-w-0 items-center gap-0.5 rounded pl-1.5 md:dock:pl-2 ${piece.slot === selectedSlot ? "bg-sky-400/30 ring-1 ring-sky-400" : "bg-muted"}`}
          >
            <button
              type="button"
              className="cursor-grab truncate active:cursor-grabbing max-md:max-w-28"
              aria-pressed={piece.slot === selectedSlot}
              aria-label={`Select ${piece.label} in layer ${depth + 1} — drag to move`}
              onClick={() => onSelectPiece(piece.slot)}
              {...pieceDragHandle(piece.slot)}
            >
              {piece.label}
            </button>
            <button
              type="button"
              className={`${LAYER_ICON_BUTTON_CLASS} hover:bg-destructive/20`}
              aria-label={`Remove one ${piece.label} from layer ${depth + 1}`}
              onClick={() => onRemovePiece(piece.slot)}
            >
              <X className={LAYER_ICON_CLASS} />
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={full}
        className={`${LAYER_ICON_BUTTON_CLASS} hover:bg-accent disabled:opacity-40`}
        aria-label={full ? `Layer ${depth + 1} full (max ${MAX_PIECES_PER_LAYER})` : `Add filling to layer ${depth + 1}`}
        onClick={onAdd}
      >
        <Plus className={LAYER_ICON_CLASS} />
      </button>
      <button
        type="button"
        className={`${LAYER_ICON_BUTTON_CLASS} text-muted-foreground hover:bg-destructive/20 hover:text-foreground`}
        aria-label={`Remove layer ${depth + 1}`}
        onClick={onRemoveLayer}
      >
        <Trash2 className={LAYER_ICON_CLASS} />
      </button>
      <button
        ref={handleRef}
        type="button"
        className={`${LAYER_ICON_BUTTON_CLASS} touch-none cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing`}
        aria-label={`Drag layer ${depth + 1} to reorder depth`}
      >
        <GripVertical className={LAYER_ICON_CLASS} />
      </button>
    </div>
  );
}

export function XrayPillow({
  placements,
  itemSubtypes,
  itemSizes,
  itemDims,
  // ponytail: a host that truly cannot know the Size falls back to M — the
  // configurator, Configure and Result all know it and pass it.
  pillowSize = "M",
  loftAllowance,
  fit: fitProp,
  onDiveChange,
  items,
  onPlacementsChange,
  controlsSlot,
  softBody = SOFT_BODY_DEFAULTS,
  className,
}: {
  placements: PillowPlacement[];
  itemSubtypes: ReadonlyMap<number, string | null>;
  itemSizes?: ReadonlyMap<number, string | null>;
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  pillowSize?: PillowSize;
  loftAllowance?: number;
  fit?: PillowFit;
  onDiveChange?: (section: Section | null) => void;
  items?: FillingItem[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  controlsSlot?: HTMLElement | null;
  softBody?: SoftBodySettings;
  className?: string;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const placementsRef = useRef(placements);
  const [hovered, setHovered] = useState<Section | null>(null);
  const [dived, setDived] = useState<Section | null>(null);
  const [openSub, setOpenSub] = useState<SubSection | null>(null);
  const [openLayer, setOpenLayer] = useState<number | null>(null);
  const [hoverSub, setHoverSub] = useState<SubSection | null>(null);
  const [selected, setSelected] = useState<PieceRef | null>(null);
  const selectedRef = useRef(selected);
  const [drag, setDrag] = useState<PouchDrag | null>(null);
  const dragRef = useRef<PouchDrag | null>(null);
  const heldGhost = useHeldGhost();
  const justDraggedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const editable = Boolean(items && onPlacementsChange);
  const isMobile = useIsMobile();
  const slotted = Boolean(controlsSlot) && !isMobile;
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const divedRef = useRef<Section | null>(null);
  const changeDive = useCallback(
    (next: Section | null) => {
      divedRef.current = next;
      setDived(next);
      onDiveChange?.(next);
    },
    [onDiveChange],
  );
  const attachRootAndTellHostItMountedUndived = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      if (el && divedRef.current === null) onDiveChange?.(null);
    },
    [onDiveChange],
  );

  const endDive = useCallback(() => {
    changeDive(null);
    setOpenSub(null);
    setOpenLayer(null);
    setHoverSub(null);
    setSelected(null);
  }, [changeDive]);

  const openPicker = useCallback((subSection: SubSection, layer: number | null) => {
    setOpenLayer(layer);
    setOpenSub(subSection);
  }, []);

  useEffect(() => {
    if (!dived) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !draggingRef.current) {
        if (selectedRef.current) {
          setSelected(null);
          return;
        }
        endDive();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!rootRef.current || rootRef.current.contains(target) || controlsSlot?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-sonner-toaster]")) return;
      endDive();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [dived, endDive, controlsSlot]);

  const stage = useMemo(() => stageGeometry(pillowSize), [pillowSize]);
  const fit = useMemo(
    () => fitProp ?? fitPillow(placements, { size: pillowSize, dims: itemDims, loftAllowance }),
    [fitProp, placements, pillowSize, itemDims, loftAllowance],
  );
  const pieces = useMemo(
    () => layoutPlacements(placements, { stage, dims: itemDims, fit }),
    [placements, stage, itemDims, fit],
  );
  const rectByKey = useMemo(() => new Map(pieces.map((pl) => [pl.key, pl] as const)), [pieces]);

  const [ownDraft, setOwnDraft] = useState<XrayDraft | null>(null);
  const linked = useXrayDraft(placements);
  const draft = ownDraft ?? (linked?.from === "cut" ? linked : null);
  const shownFit = draft?.fit ?? fit;
  const shownPieces = useMemo(
    () => (draft ? layoutPlacements(draft.placements, { stage, dims: itemDims, fit: draft.fit }) : pieces),
    [draft, pieces, stage, itemDims],
  );
  const pieceStatuses = useMemo(
    () => new Map(shownPieces.map((p) => [p.key, pieceFitStatus(shownFit, p, p.depth)] as const)),
    [shownPieces, shownFit],
  );
  const piecesByCell = useMemo(() => {
    const byCell = new Map<CellKey, typeof shownPieces>();
    for (const p of shownPieces) {
      const key = `${p.section}/${p.subSection}` as CellKey;
      const list = byCell.get(key);
      if (list) list.push(p);
      else byCell.set(key, [p]);
    }
    return byCell;
  }, [shownPieces]);
  const cellsInUse = useMemo(() => [...piecesByCell.keys()], [piecesByCell]);
  const piecesBySection = useMemo(() => bySection(shownPieces), [shownPieces]);
  const hitPiecesBySection = useMemo(() => (shownPieces === pieces ? piecesBySection : bySection(pieces)), [shownPieces, pieces, piecesBySection]);
  const sectionsInUse = useMemo(() => [...new Set([...piecesBySection.keys(), ...hitPiecesBySection.keys()])], [piecesBySection, hitPiecesBySection]);
  const settledConformed = useMemo(() => {
    const paths = new Map<string, string>();
    const { sil: SIL_REGION, sections: SECTION_REGIONS } = stageRegions(stage);
    for (const [section, list] of piecesBySection) {
      const settledRegions = [SIL_REGION, SECTION_REGIONS[section]];
      for (const p of list) {
        const shape = fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape;
        paths.set(p.key, conformPouchPath(p.settled, settledRegions, shape));
      }
    }
    return paths;
  }, [piecesBySection, itemSubtypes, stage]);
  const authoredConformed = useMemo(() => {
    const paths = new Map<string, string>();
    if (!dived) return paths;
    const { sil: SIL_REGION, sections: SECTION_REGIONS } = stageRegions(stage);
    const regions = [SIL_REGION, SECTION_REGIONS[dived]];
    for (const [key, cellPieceList] of piecesByCell) {
      if (!key.startsWith(`${dived}/`)) continue;
      for (const p of cellPieceList) {
        const shape = fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape;
        paths.set(p.key, conformPouchPath(p, regions, shape));
      }
    }
    return paths;
  }, [piecesByCell, itemSubtypes, stage, dived]);

  const planesOf = useCallback(
    (list: readonly PieceLayout[], id: string, pathOf: ReadonlyMap<string, string>, rectOf: (p: PieceLayout) => PieceRect) =>
      topPlanes(
        stage,
        list.map((p) => ({
          key: p.key,
          section: p.section,
          level: p.level,
          d: pathOf.get(p.key)!,
          rect: rectOf(p),
          shape: fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape,
          held: isNudged(p),
          relaxedH: p.relaxedH,
        })),
        id,
      ),
    [stage, itemSubtypes],
  );
  const settledPlanes = useMemo(
    () => [...piecesBySection.values()].flatMap((list) => planesOf(list, "settled", settledConformed, (p) => p.settled)),
    [piecesBySection, settledConformed, planesOf],
  );
  const authoredPlanes = useMemo(() => {
    if (!dived) return null;
    const list = [...piecesByCell].filter(([cell]) => cell.startsWith(`${dived}/`)).flatMap(([, l]) => l);
    return planesOf(list, "authored", authoredConformed, (p) => p);
  }, [dived, piecesByCell, authoredConformed, planesOf]);
  const earWell = padWellOf(softBody).width;
  const inHand = draft !== null;
  const softSettings = useMemo(() => (inHand ? draftSoftBody(softBody) : softBody), [inHand, softBody]);
  const softSettled = useSoftTopPaths(settledPlanes, softSettings, XRAY_VIEW, inHand ? HELD_EASE_MS : undefined);
  const softAuthored = useSoftTopPaths(authoredPlanes, softSettings, XRAY_VIEW, inHand ? HELD_EASE_MS : undefined);
  const settledPaths = useMemo(() => withSoft(settledConformed, softSettled), [settledConformed, softSettled]);
  const authoredPaths = useMemo(() => withSoft(authoredConformed, softAuthored), [authoredConformed, softAuthored]);

  const labelRects = useMemo(() => {
    const out = new Map<string, PieceRect>();
    for (const p of shownPieces) {
      if (p.depth !== 0) continue;
      const d = (p.section === dived ? authoredPaths : settledPaths).get(p.key);
      if (!d) continue;
      const rect = labelRectOf(d);
      const well = fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape === "ear" ? earWellCircle(d, earWell) : null;
      if (!well) {
        out.set(p.key, rect);
        continue;
      }
      const below = rect.y + rect.h - (well.cy + well.r);
      const above = well.cy - well.r - rect.y;
      out.set(
        p.key,
        below >= above
          ? { x: rect.x, y: well.cy + well.r, w: rect.w, h: Math.max(below, 0) }
          : { x: rect.x, y: rect.y, w: rect.w, h: Math.max(above, 0) },
      );
    }
    return out;
  }, [shownPieces, dived, authoredPaths, settledPaths, itemSubtypes, earWell]);  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  const divedIdx = dived ? SECTIONS.indexOf(dived) : -1;
  const mirrorIdx = dived ? SECTIONS.indexOf(mirrorTarget(dived) ?? "center") : -1;

  const addToCell = (cell: Cell, itemId: number, layer: number | null) => {
    const result = addPiece(placements, cell, itemId, layer);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onPlacementsChange?.(result.placements);
  };

  const pieceLabel = (itemId: number) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? fillingLabel(item) : `Item #${itemId}`;
  };

  const cellFitOf = (subSection: SubSection): CellFit | undefined =>
    dived ? fit.cells.find((c) => c.section === dived && c.subSection === subSection) : undefined;

  const layerWarning = (subSection: SubSection, depth: number) => {
    const cell = cellFitOf(subSection);
    const layer = cell?.layers.find((l) => l.depth === depth);
    return cell && layer && layer.status !== "ok" ? { status: layer.status, message: layerFitMessage(cell, layer) } : undefined;
  };

  const selectedPiece: (PieceRef & { itemId: number }) | null = useMemo(() => {
    if (!selected) return null;
    const p = placements.find((q) => q.section === selected.section && q.subSection === selected.subSection && q.slot === selected.slot);
    return p ? { ...selected, itemId: p.itemId } : null;
  }, [selected, placements]);
  const selectedKey = selectedPiece ? `${selectedPiece.section}/${selectedPiece.subSection}/${selectedPiece.slot}` : null;

  const fitCtx = useMemo(() => ({ size: pillowSize, dims: itemDims, loftAllowance }), [pillowSize, itemDims, loftAllowance]);

  const commitMove = (
    before: PillowPlacement[],
    next: PillowPlacement[],
    ref: PieceRef & { itemId: number },
    nextRef: PieceRef,
    nudged = false,
  ) => {
    onPlacementsChange?.(next);
    setSelected(nextRef);
    if (dived && nextRef.section !== dived) changeDive(nextRef.section);
    const label = pieceLabel(ref.itemId);
    toast.success(nudged ? `Moved ${label} within ${nextRef.section} ${nextRef.subSection}` : `Moved ${label} to ${nextRef.section} ${nextRef.subSection}`, {
      id: "xray-move",
      action: {
        label: "Undo",
        onClick: () => {
          if (placementsRef.current !== next) {
            toast.error("Undo unavailable — the mix changed after the move");
            return;
          }
          onPlacementsChange?.(before);
          setSelected(ref);
        },
      },
    });
  };

  const placeTop = (ref: PieceRef, cx: number, centreMm: number, snapView = 0): (Extract<MoveResult, { ok: true }> & { snap?: AlongSnap }) | null => {
    const p = rectByKey.get(`${ref.section}/${ref.subSection}/${ref.slot}`);
    const placed = placements.find((q) => sameRef(q, ref));
    if (!p || !placed) return null;
    const f = sizeFactors(PILLOW_DIMENSIONS[pillowSize]);
    let x = Math.min(Math.max(cx - p.w / 2, p.range.minX), Math.max(p.range.minX, p.range.maxX));
    if (snapView > 0 && Math.abs(x - p.home.x) <= snapView) x = p.home.x;
    const across = nudgePiece(placements, ref, { xMm: (x - p.home.x) / (stage.k * f.across), yMm: placed.offsetYMm ?? 0 });
    const r = placeAlongSnapped(across, ref, centreMm, snapView, false);
    const next = r ?? { ok: true as const, placements: across, ref };
    return next.placements === placements ? null : next;
  };
  const placeAlongSnapped = (base: PillowPlacement[], ref: PieceRef, centreMm: number, snapView: number, keepCell: boolean) => {
    const here = alongExtent(settlePillow(base, fitCtx), ref);
    if (!here) return null;
    const len = here.endMm - here.startMm;
    const snapMm = snapView / stage.k;
    const { centreMm: at, snap } = snapAlongCentre(centreMm, len, here.cellLengthMm, snapMm > 0 ? homeCentreMm(base, ref, fitCtx) : null, snapMm);
    const r = placeAlongAt(base, ref, at - len / 2, fitCtx, keepCell);
    return r ? { ...r, ...(snap ? { snap } : {}) } : snap ? { ok: true as const, placements: base, ref, snap } : null;
  };
  const nudgeTo = (ref: PieceRef & { itemId: number }, cx: number, centreMm: number) => {
    const r = placeTop(ref, cx, centreMm);
    if (r) commitMove(placements, r.placements, ref, r.ref, sameCellRef(r.ref, ref));
  };

  const [binHover, setBinHover] = useState<string | null>(null);
  const removeChipRef = useRef<HTMLDivElement>(null);
  const takeOut = (ref: PieceRef) => {
    const placed = placements.find((q) => sameRef(q, ref));
    if (!placed || !onPlacementsChange) return;
    const before = placements;
    const next = removePiece(before, ref, ref.slot);
    onPlacementsChange(next);
    setSelected(null);
    setBinHover(null);
    toast.success(`Removed ${pieceLabel(placed.itemId)} from ${ref.section} ${ref.subSection}`, {
      id: "xray-move",
      action: {
        label: "Undo",
        onClick: () => {
          if (placementsRef.current !== next) {
            toast.error("Undo unavailable — the mix changed after the remove");
            return;
          }
          onPlacementsChange?.(before);
        },
      },
    });
  };
  const performMove = (kind: MoveKind) => {
    const ref = selectedPiece;
    if (!ref || !onPlacementsChange) return;
    const before = placements;
    let next = before;
    let nextRef: PieceRef = ref;
    let error: string | null = null;
    const toCell = (cell: Cell) => {
      const r = movePiece(before, ref, { cell });
      if (r.ok) {
        next = r.placements;
        nextRef = r.ref;
      } else error = r.error;
    };
    switch (kind) {
      case "left":
      case "right": {
        const dir = kind === "left" ? -1 : 1;
        next = reorderInLayer(before, ref, dir);
        nextRef = reorderedRef(before, ref, dir);
        break;
      }
      case "layerUp":
      case "layerDown": {
        const r = shiftPieceLayer(before, ref, kind === "layerUp" ? -1 : 1);
        if (r.ok) {
          next = r.placements;
          nextRef = r.ref;
        } else error = r.error;
        break;
      }
      case "front":
      case "back": {
        const b = SUB_SECTIONS.indexOf(ref.subSection) + (kind === "front" ? -1 : 1);
        if (b < 0 || b >= SUB_SECTIONS.length) return;
        toCell({ section: ref.section, subSection: SUB_SECTIONS[b] });
        break;
      }
      case "sectionLeft":
      case "sectionRight": {
        const a = SECTIONS.indexOf(ref.section) + (kind === "sectionLeft" ? -1 : 1);
        if (a < 0 || a >= SECTIONS.length) return;
        toCell({ section: SECTIONS[a], subSection: ref.subSection });
        break;
      }
    }
    if (error) {
      toast.error(error);
      return;
    }
    if (next === before) return;
    commitMove(before, next, ref, nextRef);
  };
  const nudgeBy = (step: { xMm: number; yMm: number }) => {
    const ref = selectedPiece;
    const p = ref && rectByKey.get(`${ref.section}/${ref.subSection}/${ref.slot}`);
    if (!ref || !p) return;
    if (step.yMm) {
      const r = nudgeSlab(placements, ref, step.yMm, fitCtx);
      if (!r) toast(`No room to nudge ${pieceLabel(ref.itemId)} further ${step.yMm < 0 ? "to the front" : "to the back"}`, { id: "xray-move" });
      else if (r.ok) commitMove(placements, r.placements, ref, r.ref, r.within);
      return;
    }
    const here = alongExtent(fit.settle, ref);
    if (here) nudgeTo(ref, p.x + p.w / 2 + step.xMm * stage.k, (here.startMm + here.endMm) / 2);
  };
  const nudgeByRef = useRef(nudgeBy);
  const performMoveRef = useRef(performMove);
  const takeOutSelectedRef = useRef(() => {});
  useEffect(() => {
    performMoveRef.current = performMove;
    nudgeByRef.current = nudgeBy;
    takeOutSelectedRef.current = () => {
      if (selectedPiece) takeOut(selectedPiece);
    };
  });

  const toView = (clientX: number, clientY: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f };
  };
  const offXray = (clientX: number, clientY: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return false;
    const m = REMOVE_MARGIN_PX;
    if (clientX >= box.left - m && clientX <= box.right + m && clientY >= box.top - m && clientY <= box.bottom + m) return false;
    return !document.elementFromPoint(clientX, clientY)?.closest("[data-xray-dive-dock]");
  };
  const startDrag = (e: React.PointerEvent<Element>, ref: PieceRef, fromPouch: boolean) => {
    if (!editable || e.button !== 0) return;
    const key = `${ref.section}/${ref.subSection}/${ref.slot}`;
    const p = rectByKey.get(key);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    justDraggedRef.current = false;
    const at = toView(e.clientX, e.clientY);
    const drawn = p.section === dived ? p : p.settled;
    const drawnCx = drawn.x + drawn.w / 2;
    const drawnCy = drawn.y + drawn.h / 2;
    const d: PouchDrag = {
      source: { section: p.section, subSection: p.subSection, slot: p.slot, depth: p.depth, itemId: p.itemId },
      key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: fromPouch ? at.x - drawnCx : 0,
      grabY: fromPouch ? at.y - drawnCy : 0,
      ghostD: (p.section === dived ? authoredPaths : settledPaths).get(key) ?? null,
      drawnCx,
      drawnCy,
      alongShift: p.settled.y + p.settled.h / 2 - drawnCy,
      x: at.x,
      y: at.y,
      fine: pickUp([drawnCx, drawnCy], e, svgRef.current),
      snapView: 0,
      active: false,
      over: null,
      overfull: false,
      halfH: drawn.h / 2,
      pxPerView: svgScale(svgRef.current).pxPerView,
      planAt: [drawnCx, drawnCy],
      planKey: "",
      clientX: e.clientX,
      clientY: e.clientY,
      removing: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  type DropPlan =
    | { kind: "none" }
    | { kind: "refused"; error: string }
    | { kind: "move"; placements: PillowPlacement[]; ref: PieceRef; within: boolean; snap?: AlongSnap };
  const planDrop = (d: PouchDrag, over: PouchDropTarget | null, canceled: boolean): DropPlan => {
    const cell = over && { section: over.section, subSection: over.subSection };
    const layers = cell ? cellLayers(placements, cell) : [];
    const row = (layers[0] ?? []).filter((q) => !sameRef(q, d.source));
    const [cx, cy] = d.planAt;
    const index = cell
      ? dropIndex(
          row.flatMap((q) => {
            const r = rectByKey.get(`${q.section}/${q.subSection}/${q.slot}`);
            return r ? [{ cx: r.x + r.w / 2, cy: r.y + r.h / 2, h: r.h }] : [];
          }),
          cx,
          cy,
        )
      : undefined;
    const sourceIndex = (layers[0] ?? []).findIndex((q) => sameRef(q, d.source));
    const plan = planPouchDrop(d.source, over, { layerCount: layers.length, index, sourceIndex: sourceIndex < 0 ? undefined : sourceIndex }, canceled);
    if (!plan) return { kind: "none" };
    const centreMm = (cy + d.alongShift - stage.rowY[0]) / stage.k;
    if (plan.kind === "nudge") {
      const r = placeTop(d.source, cx, centreMm, d.snapView);
      return r ? { kind: "move", placements: r.placements, ref: r.ref, within: sameCellRef(r.ref, d.source), snap: r.snap } : { kind: "none" };
    }
    const moved = movePiece(placements, d.source, plan.to);
    if (!moved.ok) return { kind: "refused", error: moved.error };
    const placed = placeAlongSnapped(moved.placements, moved.ref, centreMm, d.snapView, true);
    const next = placed ?? moved;
    return { kind: "move", placements: next.placements, ref: next.ref, within: false, snap: placed?.snap };
  };

  const draftSignature = useRef("");
  const showPlan = (plan: DropPlan | null) => {
    if (!plan || plan.kind !== "move") {
      if (draftSignature.current) {
        draftSignature.current = "";
        setOwnDraft(null);
        setDraftSnap(null);
        clearXrayDraft(placements, "top");
      }
      return;
    }
    const signature = placementsSignature(plan.placements);
    if (signature === draftSignature.current) return;
    draftSignature.current = signature;
    const next: XrayDraft = {
      placements: plan.placements,
      fit: fitPillow(plan.placements, fitCtx),
      key: `${plan.ref.section}/${plan.ref.subSection}/${plan.ref.slot}`,
      from: "top",
    };
    setOwnDraft(next);
    setDraftSnap(plan.snap ?? null);
    publishXrayDraft(placements, next);
  };
  const [draftSnap, setDraftSnap] = useState<AlongSnap | null>(null);
  const snapHeld = useRef<readonly [number, number] | null>(null);

  const moveDrag = (e: React.PointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active && !pastThreshold([d.startX, d.startY], e)) return;
    if (!d.active) {
      draggingRef.current = true;
      setSelected({ section: d.source.section, subSection: d.source.subSection, slot: d.source.slot });
    }
    const at = toView(e.clientX, e.clientY);
    const step = stepHold(d.fine, [at.x - d.grabX, at.y - d.grabY], e, snapHeld.current, d.pxPerView);
    if (step.leftSnap) snapHeld.current = null;
    const fine = step.fine;
    heldGhost.place(fine.at);
    const m = svgRef.current?.getScreenCTM();
    const underPointer = dropTargetFromElement(document.elementFromPoint(e.clientX, e.clientY));
    const centreClient = m ? { x: m.a * fine.at[0] + m.c * fine.at[1] + m.e, y: m.b * fine.at[0] + m.d * fine.at[1] + m.f } : { x: e.clientX, y: e.clientY };
    const removing = !underPointer && offXray(e.clientX, e.clientY);
    const over = removing
      ? null
      : underPointer?.kind === "layer" ? underPointer : dropTargetFromElement(document.elementFromPoint(centreClient.x, centreClient.y));
    const mm = (v: number) => Math.round(v / stage.k) * stage.k;
    const planAt: Vec = [mm(fine.at[0]), mm(fine.at[1])];
    const target = over ? `${over.section}/${over.subSection}${over.kind === "layer" ? `:${over.depth}` : ""}` : "-";
    const planKey = removing ? "remove" : `${target}|${planAt[0].toFixed(2)}|${planAt[1].toFixed(2)}|${step.snapView > 0 ? 1 : 0}`;
    const next: PouchDrag = { ...d, ...at, fine, snapView: step.snapView, active: true, over, planAt, planKey, clientX: e.clientX, clientY: e.clientY, removing };
    dragRef.current = next;
    removeChipRef.current?.style.setProperty("transform", removeChipTransform(e.clientX, e.clientY));
    if (d.active && planKey === d.planKey) return;
    if (removing) {
      next.overfull = false;
      setDrag(next);
      showPlan(null);
      return;
    }
    const plan = planDrop(next, over, false);
    next.overfull =
      plan.kind === "move"
        ? fitPillow(plan.placements, fitCtx).cells.find((c) => c.section === plan.ref.section && c.subSection === plan.ref.subSection)?.status === "over"
        : false;
    setDrag(next);
    showPlan(plan);
  };
  const endDrag = (e: React.PointerEvent<Element>, canceled: boolean, onTap?: () => void) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    showPlan(null);
    if (!d.active) {
      if (!canceled && e.pointerType === "touch") onTap?.();
      return;
    }
    draggingRef.current = false;
    justDraggedRef.current = !canceled;
    if (d.removing && !canceled) {
      takeOut(d.source);
      return;
    }
    const plan = planDrop(d, canceled ? null : d.over, canceled);
    if (plan.kind === "refused") {
      toast.error(plan.error);
      return;
    }
    if (plan.kind === "move") commitMove(placements, plan.placements, d.source, plan.ref, plan.within);
  };
  const dragHandle = (ref: PieceRef, fromPouch = false, onTap?: () => void) => ({
    onPointerDown: (e: React.PointerEvent<Element>) => startDrag(e, ref, fromPouch),
    onPointerMove: moveDrag,
    onPointerUp: (e: React.PointerEvent<Element>) => endDrag(e, false, onTap),
    onPointerCancel: (e: React.PointerEvent<Element>) => endDrag(e, true),
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !editable) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-pouch-hit]")) e.preventDefault();
    };
    svg.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => svg.removeEventListener("touchstart", onTouchStart);
  }, [editable]);
  const tapPouch = (ref: PieceRef, inDive: boolean) => {
    if (!inDive && !justDraggedRef.current) {
      changeDive(ref.section);
      setOpenSub(null);
    }
    selectPiece(ref);
  };
  const selectPiece = (ref: PieceRef) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setSelected(ref);
  };

  const cancelDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    draggingRef.current = false;
    setDrag(null);
    draftSignature.current = "";
    setOwnDraft(null);
    clearXrayDraft(placementsRef.current, "top");
  }, []);
  const heldKey = ownDraft?.key ?? (drag?.active ? drag.key : null);
  const heldDrawn = useMemo(() => {
    if (!heldKey) return null;
    const p = (ownDraft ? shownPieces : pieces).find((q) => q.key === heldKey);
    if (!p) return null;
    const r = p.section === dived ? p : p.settled;
    const s = (ownDraft?.fit ?? fit).settle.pieces.find((q) => q.key === heldKey);
    const placed = (ownDraft?.placements ?? placements).find((q) => `${q.section}/${q.subSection}/${q.slot}` === heldKey);
    const acrossMm = (placed?.offsetXMm ?? 0) * sizeFactors(PILLOW_DIMENSIONS[pillowSize]).across;
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, top: r.y, startMm: s?.startMm ?? null, endMm: s?.endMm ?? null, acrossMm, section: p.section };
  }, [heldKey, ownDraft, shownPieces, pieces, fit, dived, placements, pillowSize]);
  const heldBadge =
    heldDrawn && heldDrawn.startMm !== null && heldDrawn.endMm !== null
      ? [landingText(heldDrawn.startMm, heldDrawn.endMm, ownDraft ? draftSnap : null), acrossText(heldDrawn.acrossMm)].filter(Boolean).join(" · ")
      : null;
  const snapGuide = (() => {
    if (!ownDraft || !draftSnap || !heldDrawn || heldDrawn.startMm === null || heldDrawn.endMm === null) return null;
    const mm = draftSnap === "front edge" ? heldDrawn.startMm : draftSnap === "back edge" ? heldDrawn.endMm : (heldDrawn.startMm + heldDrawn.endMm) / 2;
    const col = SECTIONS.indexOf(heldDrawn.section);
    return { y: stage.rowY[0] + mm * stage.k, x0: stage.colX[col], x1: stage.colX[col + 1] };
  })();
  useEffect(() => {
    snapHeld.current = draftSnap && ownDraft && heldDrawn ? [heldDrawn.cx, heldDrawn.cy] : null;
  }, [draftSnap, ownDraft, heldDrawn]);
  const binAt = (() => {
    if (!editable || !selectedPiece || !selectedKey || dived !== selectedPiece.section || drag?.active || openSub || draft) return null;
    const r = rectByKey.get(selectedKey);
    if (!r) return null;
    const inset = Math.min(r.w, r.h) * 0.15;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    return {
      left: clamp(((r.x + r.w - inset) / XRAY_VIEW.width) * 100, 3, 97),
      top: clamp(((r.y + inset) / XRAY_VIEW.height) * 100, 4, 96),
    };
  })();
  const removingKey = drag?.active && drag.removing ? drag.key : binAt && binHover !== null && binHover === selectedKey ? binHover : null;
  useEffect(() => {
    if (draftSnap && dragRef.current) buzz();
  }, [draftSnap]);
  useEffect(() => () => clearXrayDraft(placementsRef.current, "top"), []);
  useEffect(() => {
    if (!dragRef.current) {
      draftSignature.current = "";
      setOwnDraft(null);
    }
  }, [placements]);
  useEffect(() => {
    if (!drag?.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancelDrag();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag?.active, cancelDrag]);

  useEffect(() => {
    if (!dived || !editable || !selectedPiece) return;
    const onMoveKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || draggingRef.current) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        takeOutSelectedRef.current();
        return;
      }
      const step = nudgeKeyFor(e);
      if (step) {
        e.preventDefault();
        nudgeByRef.current(step);
        return;
      }
      const kind = moveKeyFor(e);
      if (!kind) return;
      e.preventDefault();
      performMoveRef.current(kind);
    };
    window.addEventListener("keydown", onMoveKey);
    return () => window.removeEventListener("keydown", onMoveKey);
  }, [dived, editable, selectedPiece]);

  const pieceChip = (cell: Cell, itemId: number, slots: number[]) => {
    const label = pieceLabel(itemId);
    const lastSlot = slots[slots.length - 1];
    const on = selectedPiece?.subSection === cell.subSection && slots.includes(selectedPiece.slot);
    const ref: PieceRef = { section: cell.section, subSection: cell.subSection, slot: on ? selectedPiece!.slot : slots[0] };
    return (
      <span className={`flex items-center gap-0.5 px-1 md:dock:pl-2 md:dock:pr-0.5 ${CHIP_CLASS} ${on ? "ring-1 ring-sky-400" : ""}`}>
        <button
          type="button"
          className="max-w-24 cursor-grab truncate active:cursor-grabbing md:dock:max-w-44"
          aria-pressed={on}
          aria-label={`Select ${label} in ${cell.section} ${cell.subSection} — drag to move`}
          onClick={() => selectPiece(ref)}
          {...dragHandle(ref)}
        >
          {label}
          {slots.length > 1 ? ` ×${slots.length}` : ""}
        </button>
        <button
          type="button"
          className={`${CHIP_ICON_BUTTON_CLASS} hover:bg-destructive/20`}
          aria-label={`Remove one ${label} from ${cell.section} ${cell.subSection}`}
          onClick={() => onPlacementsChange?.(removePiece(placements, cell, lastSlot))}
        >
          <X className={CHIP_ICON_CLASS} />
        </button>
      </span>
    );
  };

  const cellIsFull = (subSection: SubSection) =>
    dived !== null &&
    cellPieces(placements, { section: dived, subSection }).length >= MAX_PIECES_PER_CELL;
  const addTarget = openSub ?? hoverSub;
  const cellCenter = (subSection: SubSection) => {
    const b = SUB_SECTIONS.indexOf(subSection);
    return {
      left: `${(((stage.colX[divedIdx] + stage.colX[divedIdx + 1]) / 2) / XRAY_VIEW.width) * 100}%`,
      top: `${(((stage.rowY[b] + stage.rowY[b + 1]) / 2) / XRAY_VIEW.height) * 100}%`,
    };
  };
  const divedColumnWidth = `${((stage.colX[divedIdx + 1] - stage.colX[divedIdx]) / XRAY_VIEW.width) * 100}%`;
  const cellAnchor = (subSection: SubSection) => {
    const b = SUB_SECTIONS.indexOf(subSection);
    const base = { left: cellCenter(subSection).left, width: divedColumnWidth };
    if (b === 0) return { style: { ...base, top: "1%" }, translate: "-translate-x-1/2" };
    if (b === SUB_SECTIONS.length - 1) {
      return { style: { ...base, bottom: "1%" }, translate: "-translate-x-1/2" };
    }
    return {
      style: { ...base, top: cellCenter(subSection).top },
      translate: "-translate-x-1/2 -translate-y-1/2",
    };
  };

  const arrangementToggle = (cell: Cell, subSection: SubSection, stacked: boolean) => (
    <div
      className="pointer-events-auto flex shrink-0 overflow-hidden rounded border text-[9px] leading-4 shadow-sm max-md:text-[11px] max-md:leading-5 md:dock:rounded-md md:dock:text-xs md:dock:leading-6"
      role="group"
      aria-label={`${cell.section} ${subSection} arrangement`}
    >
      {(["side", "stacked"] as const).map((mode) => {
        const on = (mode === "stacked") === stacked;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={on}
            className={`px-1.5 py-0.5 max-md:px-2.5 max-md:py-1 md:dock:px-2.5 md:dock:py-1.5 ${on ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
            onClick={() => onPlacementsChange?.(setCellArrangement(placements, cell, mode))}
          >
            {mode === "side" ? "Side" : "Stacked"}
          </button>
        );
      })}
    </div>
  );

  const mirrorButton = (section: Section, compact: boolean) => {
    const to = mirrorTarget(section);
    if (to === null) return null;
    const empty = placements.every((p) => p.section !== section);
    return (
      <button
        type="button"
        className={
          compact
            ? `pointer-events-auto flex items-center gap-0.5 px-1 aria-disabled:opacity-40 hover:bg-accent ${CHIP_CLASS}`
            : "flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent aria-disabled:opacity-40 md:dock:text-sm"
        }
        aria-disabled={empty}
        aria-label={
          empty
            ? `Nothing in the ${section} section to mirror`
            : `Mirror the ${section} section onto the ${to} section, replacing it`
        }
        onClick={() => {
          if (empty) return;
          const before = placements;
          const next = mirrorSection(before, section);
          if (next === before) return;
          onPlacementsChange?.(next);
          toast.success(`Mirrored ${section} onto ${to}`, {
            action: {
              label: "Undo",
              onClick: () => {
                if (placementsRef.current !== next) {
                  toast.error("Undo unavailable — the mix changed after the mirror");
                  return;
                }
                onPlacementsChange?.(before);
              },
            },
          });
        }}
      >
        <FlipHorizontal2 className={compact ? CHIP_ICON_CLASS : "size-4"} />
        {empty ? "Nothing to mirror" : `Mirror to ${to}`}
      </button>
    );
  };

  const addLayerButton = (cell: Cell, subSection: SubSection, layers: readonly unknown[]) => (
    <button
      type="button"
      data-drop-cell={`${cell.section}/${cell.subSection}`}
      data-drop-layer={layers.length}
      className={`pointer-events-auto flex items-center gap-0.5 px-1 hover:bg-accent max-md:min-h-7 max-md:px-2 md:dock:min-h-9 md:dock:gap-1.5 md:dock:px-3 ${CHIP_CLASS}`}
      aria-label={`Add a layer under ${cell.section} ${subSection}`}
      onClick={() => openPicker(subSection, layers.length)}
    >
      <Layers className={CHIP_ICON_CLASS} />
      Add layer
    </button>
  );


  const sideChips =
    dived === null
      ? []
      : SUB_SECTIONS.flatMap((subSection) => {
          const cell: Cell = { section: dived, subSection };
          const cellPcs = cellPieces(placements, cell);
          if (cellPcs.length === 0) return [];
          if (cellPcs.length >= 2 && cellArrangement(placements, cell) === "stacked") return [];
          const groups = new Map<number, number[]>();
          for (const p of cellPcs) {
            const s = groups.get(p.itemId);
            if (s) s.push(p.slot);
            else groups.set(p.itemId, [p.slot]);
          }
          return [...groups].flatMap(([itemId, slots]) => {
            const centers = slots.flatMap((slot) => {
              const r = rectByKey.get(`${dived}/${subSection}/${slot}`);
              return r ? [[r.x + r.w / 2, r.y + r.h / 2] as const] : [];
            });
            if (centers.length === 0) return [];
            const cx = centers.reduce((s, c) => s + c[0], 0) / centers.length;
            const cy = centers.reduce((s, c) => s + c[1], 0) / centers.length;
            return [{ subSection, cell, itemId, slots, cx, cy }];
          });
        });

  const panels =
    dived === null
      ? []
      : SUB_SECTIONS.map((subSection) => {
          const cell: Cell = { section: dived, subSection };
          const cellPcs = cellPieces(placements, cell);
          const layers = cellLayers(placements, cell);
          return { subSection, cell, cellPcs, stacked: layers.length > 1, layers };
        });
  const layerDragEnd =
    (cell: Cell, layers: PillowPlacement[][]) => (event: SortableDragEndEvent) => {
      draggingRef.current = false;
      const move = layerDragDestination(layers, event);
      if (!move) return;
      const { from, to } = move;
      onPlacementsChange?.(moveLayer(placements, cell, from, to));
    };

  const diveControls = (chrome: string) =>
    dived && (
      <div className={`flex flex-col ${chrome}`}>
        <div className="mb-1 flex shrink-0 flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-semibold capitalize md:dock:text-base">{dived} section</span>
          <div className="ml-auto flex items-center gap-2">
            {mirrorButton(dived, false)}
            <button
              type="button"
              className="min-h-9 rounded-lg px-3 text-xs font-medium hover:bg-accent md:dock:text-sm"
              onClick={endDive}
            >
              Done
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panels.map(({ subSection, cell, cellPcs, stacked, layers }) => {
          const full = cellIsFull(subSection);
          return (
            <div
              key={subSection}
              className="flex flex-col gap-1.5 border-t border-border/60 px-1 py-2 first:border-t-0 md:dock:gap-2 md:dock:py-3"
            >
              <div className="flex flex-wrap items-center gap-1.5 md:dock:gap-2">
                <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground md:dock:w-16 md:dock:text-xs">
                  {subSection}
                </span>
                {cellPcs.length >= 2 && arrangementToggle(cell, subSection, stacked)}
                <button
                  type="button"
                  disabled={full}
                  className={`ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap px-1 hover:bg-accent disabled:opacity-40 max-md:min-h-7 max-md:px-2 md:dock:min-h-9 md:dock:gap-1.5 md:dock:px-3 ${CHIP_CLASS}`}
                  aria-label={
                    full
                      ? `${dived} ${subSection} cell full (max ${MAX_PIECES_PER_CELL})`
                      : `Add filling to ${dived} ${subSection}`
                  }
                  onClick={() => !full && openPicker(subSection, null)}
                >
                  <Plus className={CHIP_ICON_CLASS} />
                  {full ? "Full" : "Add filling"}
                </button>
              </div>
              {cellPcs.length > 0 && cellFitOf(subSection) && (
                <CellFitNote cell={cellFitOf(subSection)!} size={pillowSize} className="text-[11px] md:dock:text-sm" />
              )}
              {!stacked && cellPcs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {sideChips
                    .filter((fc) => fc.subSection === subSection)
                    .map((fc) => (
                      <span key={fc.itemId}>{pieceChip(fc.cell, fc.itemId, fc.slots)}</span>
                    ))}
                  {slotted && layers.length < MAX_LAYERS_PER_CELL && addLayerButton(cell, subSection, layers)}
                </div>
              )}
              {stacked && (
                <DragDropProvider
                  onDragStart={() => (draggingRef.current = true)}
                  onDragEnd={layerDragEnd(cell, layers)}
                >
                  {layers.map((layer, depth) => (
                    <LayerRow
                      key={layerSortableId(layer)}
                      id={layerSortableId(layer)}
                      index={depth}
                      depth={depth}
                      dropCell={`${cell.section}/${cell.subSection}`}
                      full={layer.length >= MAX_PIECES_PER_LAYER}
                      warning={layerWarning(subSection, depth)}
                      pieces={layer.map((p) => ({ slot: p.slot, label: pieceLabel(p.itemId) }))}
                      selectedSlot={selectedPiece?.subSection === subSection ? selectedPiece.slot : null}
                      onSelectPiece={(slot) => selectPiece({ section: cell.section, subSection: cell.subSection, slot })}
                      pieceDragHandle={(slot) => dragHandle({ section: cell.section, subSection: cell.subSection, slot })}
                      onAdd={() => openPicker(subSection, depth)}
                      onRemoveLayer={() => onPlacementsChange?.(removeLayer(placements, cell, depth))}
                      onRemovePiece={(slot) =>
                        onPlacementsChange?.(removePiece(placements, cell, slot))
                      }
                    />
                  ))}
                </DragDropProvider>
              )}
              {cellPcs.length > 0 &&
                (stacked || !slotted) &&
                layers.length < MAX_LAYERS_PER_CELL &&
                addLayerButton(cell, subSection, layers)}
            </div>
          );
        })}
        </div>
      </div>
    );

  return (
    <div ref={attachRootAndTellHostItMountedUndived} className={className} style={{ pointerEvents: "none" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-label="X-ray filling view"
      >
        <defs>
          <clipPath id={clipId("sil")}>
            <path d={stage.silhouettePath} />
          </clipPath>
          {sectionsInUse.map((section) => (
            <clipPath key={section} id={clipId(section)}>
              <path d={stage.sectionHitPaths[section]} />
            </clipPath>
          ))}
          {cellsInUse.map((key) => (
            <clipPath key={key} id={clipId(key)}>
              <path d={stage.cellClipPaths[key]} />
            </clipPath>
          ))}
        </defs>

        <g>
          <g clipPath={`url(#${clipId("sil")})`}>
            <path d={stage.silhouettePath} fill={XRAY_INTERIOR} />

            {sectionsInUse.map((section) => {
              const authored = dived === section;
              const list = piecesBySection.get(section) ?? [];
              return (
                <g key={section} clipPath={`url(#${clipId(section)})`}>
                  {authored &&
                    list.map((p) =>
                      isSpread(p) ? (
                        <path
                          key={`ghost-${p.key}`}
                          d={settledPaths.get(p.key)!}
                          fill="none"
                          stroke="rgba(255,255,255,0.75)"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null,
                    )}
                  {list.map((p) => {
                    const subtype = itemSubtypes.get(p.itemId) ?? null;
                    const visual = fillingVisual(subtype);
                    const d = (authored ? authoredPaths.get(p.key) : settledPaths.get(p.key))!;
                    const squeeze = pieceStatuses.get(p.key) ?? RELAXED_PIECE;
                    return (
                      <g key={p.key}>
                        <MorphPiece
                          key={visual.shape}
                          subtype={subtype}
                          visual={visual}
                          d={d}
                          view={authored ? "authored" : "settled"}
                          status={squeeze.status}
                          well={earWell}
                        />
                        {p.depth > 0 && (
                          <path d={d} fill="rgb(2,6,23)" fillOpacity={Math.min(0.14 * p.depth, 0.5)} />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {[stage.colX[1], stage.colX[2]].map((x) => (
              <path
                key={`seam-${x}`}
                d={`M${x} ${stage.rowY[0]} L${x} ${stage.rowY[3]}`}
                fill="none"
                stroke={XRAY_SHELL}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                data-xray-divider-seam
              />
            ))}

            {!draft && selectedPiece && dived === selectedPiece.section && authoredPaths.has(selectedKey!) && (
              <path
                d={authoredPaths.get(selectedKey!)!}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                data-xray-selected-piece
              />
            )}
            {draft && (draft.key.startsWith(`${dived}/`) ? authoredPaths : settledPaths).get(draft.key) && (
              <path
                d={(draft.key.startsWith(`${dived}/`) ? authoredPaths : settledPaths).get(draft.key)!}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                data-xray-selected-piece
                data-xray-linked={draft.from}
              />
            )}

            {drag?.active && drag.over && (
              <path
                d={stage.cellClipPaths[`${drag.over.section}/${drag.over.subSection}`]}
                fill={drag.overfull ? AMBER : "#38bdf8"}
                fillOpacity={drag.overfull ? 0.25 : 0.18}
                data-xray-drop-hover={drag.overfull ? "overfull" : "ok"}
              />
            )}

            {shownPieces.map((p) =>
              p.depth === 0 && !(editable && !isMobile && !slotted && p.section === dived) ? (
                <PieceLabel
                  key={`label-${p.key}`}
                  rect={labelRects.get(p.key) ?? (p.section === dived ? p : p.settled)}
                  lines={pieceLabelLines(itemSubtypes.get(p.itemId) ?? null, itemSizes?.get(p.itemId) ?? null)}
                />
              ) : null,
            )}

            {hovered && hovered !== dived && (
              <path d={stage.sectionHitPaths[hovered]} fill="white" fillOpacity={0.15} />
            )}

            {dived &&
              SECTIONS.filter((s) => s !== dived).map((s) => (
                <path key={s} d={stage.sectionHitPaths[s]} fill={XRAY_VEIL} fillOpacity={0.55} />
              ))}

            {dived && editable && addTarget && (
              <path
                d={stage.cellClipPaths[`${dived}/${addTarget}`]}
                fill="white"
                fillOpacity={cellIsFull(addTarget) ? 0.05 : 0.14}
              />
            )}
            {removingKey && (removingKey.startsWith(`${dived}/`) ? authoredPaths : settledPaths).get(removingKey) && (
              <path
                d={(removingKey.startsWith(`${dived}/`) ? authoredPaths : settledPaths).get(removingKey)!}
                fill={REMOVE_RED}
                fillOpacity={0.6}
                stroke={REMOVE_RED}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                data-xray-removing
              />
            )}
          </g>

          <path
            d={stage.silhouettePath}
            fill="none"
            stroke={XRAY_SHELL}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />

          {SECTIONS.map((section) => (
            <path
              key={section}
              d={stage.sectionHitPaths[section]}
              data-section={section}
              role={editable ? "button" : undefined}
              aria-label={editable ? `Dive into ${section} section` : undefined}
              fill="transparent"
              style={{ pointerEvents: "auto", cursor: editable ? "pointer" : "default" }}
              onMouseEnter={() => setHovered(section)}
              onMouseLeave={() => setHovered((h) => (h === section ? null : h))}
              onClick={
                editable
                  ? () => {
                      changeDive(section);
                      setOpenSub(null);
                      setSelected(null);
                    }
                  : undefined
              }
            />
          ))}

          {dived &&
            editable &&
            SUB_SECTIONS.map((subSection) => {
              const full = cellIsFull(subSection);
              return (
                <path
                  key={subSection}
                  d={stage.cellClipPaths[`${dived}/${subSection}`]}
                  clipPath={`url(#${clipId("sil")})`}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    full
                      ? `${dived} ${subSection} cell full`
                      : `Add filling to ${dived} ${subSection}`
                  }
                  aria-disabled={full || undefined}
                  fill="transparent"
                  style={{ pointerEvents: "auto", cursor: full ? "not-allowed" : "pointer", outline: "none" }}
                  onMouseEnter={() => setHoverSub(subSection)}
                  onMouseLeave={() => setHoverSub((h) => (h === subSection ? null : h))}
                  onFocus={() => setHoverSub(subSection)}
                  onBlur={() => setHoverSub((h) => (h === subSection ? null : h))}
                  onClick={() => !full && openPicker(subSection, null)}
                  onKeyDown={(e) => {
                    if (full || (e.key !== "Enter" && e.key !== " ")) return;
                    e.preventDefault();
                    openPicker(subSection, null);
                  }}
                />
              );
            })}

          {editable &&
            sectionsInUse.flatMap((section) =>
              (hitPiecesBySection.get(section) ?? []).map((p) => {
                const inDive = section === dived;
                const d =
                  (inDive ? authoredPaths : settledPaths).get(p.key) ??
                  conformPouchPath(inDive ? p : p.settled, [stageRegions(stage).sil, stageRegions(stage).sections[section]], fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape);
                const on = selectedKey === p.key;
                const ref = { section: p.section, subSection: p.subSection, slot: p.slot };
                return (
                  <path
                    key={`hit-${p.key}`}
                    d={d}
                    clipPath={`url(#${clipId("sil")})`}
                    role="button"
                    tabIndex={inDive ? 0 : -1}
                    aria-pressed={on}
                    aria-label={`${on ? "Selected" : "Select"} ${pieceLabel(p.itemId)} in ${p.section} ${p.subSection} — drag to move`}
                    fill="transparent"
                    style={{ pointerEvents: "auto", cursor: drag?.active ? "grabbing" : "grab", outline: "none", touchAction: "none" }}
                    onMouseEnter={() => setHovered(section)}
                    onMouseLeave={() => setHovered((h) => (h === section ? null : h))}
                    onClick={() => tapPouch(ref, inDive)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      setSelected({ section: p.section, subSection: p.subSection, slot: p.slot });
                    }}
                    data-pouch-hit
                    {...dragHandle(ref, true, () => tapPouch(ref, inDive))}
                  />
                );
              }),
            )}

          {drag?.active &&
            SECTIONS.flatMap((section) =>
              SUB_SECTIONS.map((subSection) => (
                <path
                  key={`drop-${section}/${subSection}`}
                  d={stage.cellClipPaths[`${section}/${subSection}`]}
                  clipPath={`url(#${clipId("sil")})`}
                  data-drop-cell={`${section}/${subSection}`}
                  fill="transparent"
                  style={{ pointerEvents: "auto" }}
                />
              )),
            )}

          {snapGuide && drag?.active && (
            <path
              d={`M${snapGuide.x0} ${snapGuide.y} H${snapGuide.x1}`}
              stroke="#38bdf8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${clipId("sil")})`}
              pointerEvents="none"
              data-xray-snap-guide
            />
          )}
          {drag?.active && (
            <HeldGhost
              handle={heldGhost}
              d={drag.ghostD ?? ""}
              offset={[-drag.drawnCx, -drag.drawnCy]}
              fill={
                drag.removing
                  ? REMOVE_RED
                  : `var(${fillingVisual(itemSubtypes.get(drag.source.itemId) ?? null).cssVar}, ${fillingVisual(itemSubtypes.get(drag.source.itemId) ?? null).defaultColor})`
              }
              halfH={drag.halfH}
              badge={drag.removing ? null : heldBadge}
              badgeFont={badgeFontFor(drag.pxPerView)}
              bounds={[4, XRAY_VIEW.width - 4, 0]}
            />
          )}
        </g>
      </svg>

      {dived && editable && (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} data-xray-dive>
          {!isMobile && !slotted && (
            <div
              className="absolute z-30 flex -translate-x-1/2 justify-center"
              style={{
                left: `${(((stage.colX[mirrorIdx] + stage.colX[mirrorIdx + 1]) / 2) / XRAY_VIEW.width) * 100}%`,
                top: "1.5%",
                pointerEvents: "none",
              }}
              data-xray-dive-section-bar
            >
              {mirrorButton(dived, true)}
            </div>
          )}

          {!isMobile && !slotted && sideChips.map((fc) => (
            <div
              key={`${fc.subSection}-${fc.itemId}`}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(fc.cx / XRAY_VIEW.width) * 100}%`,
                top: `${(fc.cy / XRAY_VIEW.height) * 100}%`,
                pointerEvents: "auto",
              }}
            >
              {pieceChip(fc.cell, fc.itemId, fc.slots)}
            </div>
          ))}

          {binAt && selectedPiece && (
            <button
              type="button"
              className="absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-destructive text-white shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-9"
              style={{ left: `${binAt.left}%`, top: `${binAt.top}%`, pointerEvents: "auto" }}
              aria-label={`Remove ${pieceLabel(selectedPiece.itemId)} from ${selectedPiece.section} ${selectedPiece.subSection}`}
              title="Remove (Delete)"
              onPointerEnter={() => setBinHover(selectedKey)}
              onPointerLeave={() => setBinHover(null)}
              onFocus={() => setBinHover(selectedKey)}
              onBlur={() => setBinHover(null)}
              onClick={() => takeOut(selectedPiece)}
              data-xray-remove-piece
            >
              <Trash2 className="size-3.5 max-md:size-4" aria-hidden />
            </button>
          )}

          {!isMobile &&
            panels.map(({ subSection, cell, cellPcs, stacked, layers }) => {
              const hinting = hoverSub === subSection;
              if (openSub === subSection) return null;
              if (cellPcs.length < 1 && !hinting) return null;
              if (slotted) {
                return hinting ? (
                  <span
                    key={subSection}
                    className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    style={cellCenter(subSection)}
                  >
                    {cellIsFull(subSection) ? `Cell full (max ${MAX_PIECES_PER_CELL})` : "Click to add filling"}
                  </span>
                ) : null;
              }
              return (
                <div
                  key={subSection}
                  className={`absolute z-20 flex flex-col items-center gap-0.5 ${cellAnchor(subSection).translate}`}
                  style={{ ...cellAnchor(subSection).style, pointerEvents: "none" }}
                >
                  {cellPcs.length > 0 && cellFitOf(subSection) && (
                    <CellFitNote
                      cell={cellFitOf(subSection)!}
                      size={pillowSize}
                      className={`pointer-events-auto px-1 ${CHIP_CLASS}`}
                    />
                  )}
                  {/* ponytail: a side cell's centroid chips share this band; the
                      panel's opaque background and z-20 keep the toggle
                      readable. Tighten the chips to max-w-16 if it ever bites. */}
                  {cellPcs.length >= 2 && arrangementToggle(cell, subSection, stacked)}
                  {stacked && (
                    <DragDropProvider
                      onDragStart={() => (draggingRef.current = true)}
                      onDragEnd={layerDragEnd(cell, layers)}
                    >
                      {layers.map((layer, depth) => (
                        <LayerRow
                          key={layerSortableId(layer)}
                          id={layerSortableId(layer)}
                          index={depth}
                          depth={depth}
                          dropCell={`${cell.section}/${cell.subSection}`}
                          full={layer.length >= MAX_PIECES_PER_LAYER}
                          warning={layerWarning(subSection, depth)}
                          pieces={layer.map((p) => ({ slot: p.slot, label: pieceLabel(p.itemId) }))}
                          selectedSlot={selectedPiece?.subSection === subSection ? selectedPiece.slot : null}
                          onSelectPiece={(slot) => selectPiece({ section: cell.section, subSection: cell.subSection, slot })}
                          pieceDragHandle={(slot) => dragHandle({ section: cell.section, subSection: cell.subSection, slot })}
                          onAdd={() => openPicker(subSection, depth)}
                          onRemoveLayer={() => onPlacementsChange?.(removeLayer(placements, cell, depth))}
                          onRemovePiece={(slot) =>
                            onPlacementsChange?.(removePiece(placements, cell, slot))
                          }
                        />
                      ))}
                    </DragDropProvider>
                  )}
                  {cellPcs.length > 0 &&
                    layers.length < MAX_LAYERS_PER_CELL &&
                    addLayerButton(cell, subSection, layers)}
                  {hinting && (
                    <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded border bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground max-md:text-[11px]">
                      {cellIsFull(subSection)
                        ? `Cell full (max ${MAX_PIECES_PER_CELL})`
                        : "Click to add filling"}
                    </span>
                  )}
                </div>
              );
            })}

          {openSub && (
            <div
              className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
              style={{
                ...(isMobile ? { left: "50%", top: "50%" } : cellCenter(openSub)),
                width: isMobile ? "100%" : slotted ? SLOTTED_BLOOM_PX : divedColumnWidth,
                pointerEvents: "auto",
              }}
            >
              <SunburstMenu
                open
                root={fillingTree}
                display="text"
                size={isMobile ? 280 : slotted ? SLOTTED_BLOOM_PX : 220}
                ringWidth={isMobile ? 48 : slotted ? 56 : 40}
                holeRadius={isMobile ? 26 : slotted ? 24 : 18}
                largeLabels={slotted}
                centerIcon={Plus}
                ariaLabel={
                  openLayer === null
                    ? `Add filling to ${dived} ${openSub}`
                    : `Add filling to ${dived} ${openSub} layer ${openLayer + 1}`
                }
                onOpenChange={(o) => {
                  if (!o) setOpenSub(null);
                }}
                onSelect={(leaf) =>
                  addToCell({ section: dived, subSection: openSub }, Number(leaf.id), openLayer)
                }
              />
            </div>
          )}
        </div>
      )}

      {editable && isMobile && !dived && (
        <p
          className="pointer-events-none absolute inset-x-0 top-full text-center text-[11px] leading-4 text-white/70"
          aria-hidden
        >
          Tap a section to edit · drag a pouch to move it, slowly to place it exactly, or off the x-ray to remove it
        </p>
      )}

      {drag?.active && drag.removing && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset ring-destructive" data-xray-remove-ring />
          {createPortal(
            <div
              ref={removeChipRef}
              className="pointer-events-none fixed left-0 top-0 z-[100] flex items-center gap-1.5 whitespace-nowrap rounded-full bg-destructive px-2.5 py-1 text-xs font-medium text-white shadow-lg"
              style={{ transform: removeChipTransform(drag.clientX, drag.clientY) }}
              role="status"
              data-xray-remove-chip
            >
              <Trash2 className="size-3.5" aria-hidden />
              Release to remove {pieceLabel(drag.source.itemId)}
            </div>,
            document.body,
          )}
        </>
      )}

      {dived && editable && isMobile && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2"
          style={{ pointerEvents: "auto" }}
          data-xray-dive-dock
        >
          {diveControls("max-h-[70vh] rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-xl")}
        </div>
      )}
      {dived && editable && slotted && createPortal(<div data-xray-dive-dock className="flex min-h-0 flex-1 flex-col">{diveControls("min-h-0 flex-1")}</div>, controlsSlot!)}
    </div>
  );
}
