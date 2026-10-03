"use client";

/**
 * X-ray filling renderer + dive editor (slices 07/08). ADR 0009 guardrails:
 * nested clipping (silhouette ∩ Section, ∩ cell in the dive) — never box crops; deterministic layout
 * via layoutPlacements; pieces keep distinct outlines; colors via per-subtype
 * CSS variables; all paths come from the one asset pipeline (xray-assets);
 * shape swaps use PREPARED flubber morphs (crossfade on degenerate pairs) and
 * animations touch only `transform` / path `d` / paint opacity — no layout.
 * Staff-only: callers mount this behind the staff assist gate.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  type PieceRef,
} from "@/lib/configurator/staff-assist";
import { isTypingTarget, moveKeyFor, nudgeKeyFor, type MoveKind } from "@/lib/configurator/move-keys";
import {
  dropIndex,
  dropTargetFromElement,
  layerChoices,
  planPouchDrop,
  pouchDropDestination,
  resolveLayerChoice,
  type PouchDropTarget,
} from "@/lib/dnd/pouch-drag";
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
  type ConformRegion,
} from "@/lib/spatial-fillings/conform";
import { getShapeMorph, prepareMorph } from "@/lib/spatial-fillings/morphs";
import { fillingVisual, type FillingVisual } from "@/lib/spatial-fillings/visuals";
import {
  fitMessage,
  fitPillow,
  layerFitMessage,
  pieceFitStatus,
  wouldFit,
  type CellFit,
  type FitStatus,
  type PieceFitStatus,
  type PillowFit,
} from "@/lib/spatial-fillings/fit";
import { layoutPlacements, type PieceLayout, type PieceRect } from "@/lib/spatial-fillings/xray-layout";
import { stageGeometry, type StageGeometry } from "@/lib/spatial-fillings/xray-stage";
import { PILLOW_DIMENSIONS, sizeFactors, type PillowSize, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { FILLING_SHAPE_PATHS, SHELL_SEAM, XRAY_VIEW, type CellKey } from "./xray-assets";

// Shell regions pouches deform against: the silhouette (wide seam), each
// cell's boundary (thin seam, matching the pouch-to-pouch gap) for the
// authored view, and each Section's for the settled view (slice 11: only the
// Section walls are walls). One set per Size (slice 02), built on first use
// and shared by every x-ray on the page.
type StageRegions = {
  sil: ConformRegion;
  cells: Record<CellKey, ConformRegion>;
  sections: Record<Section, ConformRegion>;
};
/** Seam a pouch keeps from a cell or Section wall: a hair, so neighbours press together (the layout's INSET adds one more). */
const WALL_SEAM = 0.5;
const REGIONS_BY_SIZE = new Map<PillowSize, StageRegions>();
export function stageRegions(stage: StageGeometry): StageRegions {
  let regions = REGIONS_BY_SIZE.get(stage.size);
  if (!regions) {
    regions = {
      sil: makeRegion(stage.silhouettePolygon, SHELL_SEAM),
      cells: Object.fromEntries(
        (Object.entries(stage.cellPolygons) as Array<[CellKey, StageGeometry["silhouettePolygon"]]>).map(
          ([key, poly]) => [key, makeRegion(poly, WALL_SEAM)],
        ),
      ) as Record<CellKey, ConformRegion>,
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

/** The two views of one recipe (slice 11): the cells as authored, or where the fill settles. */
export type PieceView = "authored" | "settled";

/** A piece whose settled rect differs from its authored one — the dive draws its settled outline as a ghost. */
const isSpread = (p: PieceLayout) => p.settled.y !== p.y || p.settled.h !== p.h;

// useLayoutEffect starts morphs before paint (no first-frame flash); SSR no-ops.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MORPH_MS = 320;

// Shell paint, themeable: the configurator's stage is dark in both themes, so
// the defaults are the dark values; XrayEditor's frame redefines the variables
// for light mode (and back for dark).
export const XRAY_SHELL = "var(--xray-shell, rgba(255,255,255,0.9))";
export const XRAY_INTERIOR = "var(--xray-interior, rgba(15,23,42,0.5))";
const XRAY_VEIL = "var(--xray-veil, rgb(2,6,23))";
// Fit status paint (slice 04): red when a cell cannot close — the piece tint,
// the drop refusal and the cross-section share it. (The amber / red cell
// rings went with Ivan's 26-9-2026 review: no seams on the pillow but the two
// dividers; the gauge, the banner and the tint carry the status.)
const RING_OVER = "#ef4444";
const RELAXED_PIECE: PieceFitStatus = { status: "ok", widthRatio: 1, thicknessRatio: 1 };
/** A pouch drag in flight (slice 07). */
type PouchDrag = {
  source: PieceRef & { depth: number; itemId: number };
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where on the pouch it was picked up, in view units from its centre (0 from a label). */
  grabX: number;
  grabY: number;
  /** The pointer in view units — the ghost follows it, the drop position reads it. */
  x: number;
  y: number;
  active: boolean;
  over: PouchDropTarget | null;
  /** The hovered target would leave its cell unable to close. */
  overfull: boolean;
};
/** A stacked cell a pouch was dropped on: the Layer picker blooms at the drop point. */
type LayerPick = {
  source: PieceRef & { depth: number; itemId: number };
  cell: Cell;
  /** Drop point, in % of the editor box. */
  left: string;
  top: string;
};
const DRAG_THRESHOLD_PX = 6;
const sameRef = (p: PieceRef, q: PieceRef) => p.section === q.section && p.subSection === q.subSection && p.slot === q.slot;
const sameCellRef = (p: Cell, q: Cell) => p.section === q.section && p.subSection === q.subSection;

/** `↕ 78 %` / `↔ 85 %` beside the type label when the piece draws squeezed. */
export const squeezeLines = (ps: PieceFitStatus | undefined): string[] => {
  if (!ps) return [];
  const out: string[] = [];
  if (ps.thicknessRatio < 1 - 1e-6) out.push(`↕ ${Math.round(ps.thicknessRatio * 100)} %`);
  if (ps.widthRatio < 1 - 1e-6) out.push(`↔ ${Math.round(ps.widthRatio * 100)} %`);
  return out;
};

// Dive-editor control sizing. The chips sit ON the pouches, so on a desktop
// stage (650px wide) they stay tiny; below md the stage is ~360px wide and
// there is no hover or precise pointer, so the same chips grow to a readable
// 11px with ~28px icon buttons — the largest that still fits three per cell.
const CHIP_CLASS = "rounded border bg-background/90 shadow-sm text-[9px] leading-4 max-md:text-[11px] max-md:leading-5";
const CHIP_ICON_CLASS = "size-2.5 max-md:size-3.5";
const CHIP_ICON_BUTTON_CLASS = "shrink-0 rounded max-md:flex max-md:size-7 max-md:items-center max-md:justify-center";

// Layer rows are the one control staff DRAG, and a grab that misses scrolls the
// page instead — so they get their own, larger scale rather than the read-mostly
// chip sizing above. Desktop: 20px buttons (was a bare ~10px icon) on a panel
// that still has to fit five rows inside a ~112px cell. Phone: the dock is in
// normal flow with room, so the buttons go to the 44px minimum touch target.
const LAYER_ROW_CLASS =
  "rounded-md border bg-background/95 shadow-sm text-[10px] leading-4 max-md:text-[13px] max-md:leading-6";
const LAYER_ICON_CLASS = "size-3 max-md:size-4";
const LAYER_ICON_BUTTON_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded max-md:size-11";
const easeOut = (t: number) => t * (2 - t);

/**
 * One filling piece; `d` is its conform-deformed outline in view coordinates
 * (see conform.ts), so its border follows the shell curve with no sharp cut
 * corners. When its shape swaps (item type change in the same slot), the
 * prepared flubber interpolator animates path `d`; degenerate pairs crossfade
 * an old-shape ghost instead — attribute writes only, no re-layout.
 * ponytail: swap morphs interpolate the normalized asset shapes, not the
 * conformed outline, so callers key a piece by its shape and a pouch↔pill swap
 * remounts instead of morphing. Rebase the morphs through conformPouchPath
 * before animating a swap.
 *
 * A `view` flip (slice 11: the dived Section shows authored cells, everything
 * else the settled fill) morphs `d` from the outline it had in the other view:
 * both are conformed polygons of the same pouch, so one interpolator is
 * prepared per transition, degeneracy-checked, crossfade on failure. A `d`
 * change within one view (a neighbour added, the Size changed) snaps, as before.
 */
export function MorphPiece({
  subtype,
  visual,
  d,
  view = "settled",
  status = "ok",
}: {
  subtype: string | null;
  visual: FillingVisual;
  d: string;
  view?: PieceView;
  /** The piece's own fit (slice 04): a squeezed piece draws with a dashed stroke. */
  status?: FitStatus;
}) {
  const shape = visual.shape;
  const ref = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  const prevShape = useRef(shape);
  const [ghost, setGhost] = useState<typeof shape | null>(null);
  // The settle transition: the outline before the view flipped, and a ghost
  // carrying it while a degenerate pair crossfades instead.
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
    return () => cancelAnimationFrame(raf);
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

  return (
    <>
      {ghost && <path ref={ghostRef} d={d} {...paint} />}
      {settleGhost && <path ref={settleGhostRef} d={settleGhost} {...paint} />}
      <path ref={ref} d={d} {...paint} />
    </>
  );
}

/**
 * A cell's loft against its Section's budget (slice 04): `42 / 60 mm`, a bar,
 * and the fit message when the stack is at its limit or past it. Reads the
 * fit the x-ray already holds; nothing is recomputed. Not interactive — it sits
 * over the cell art and must not swallow the click that adds to it.
 */
export function LoftGauge({ cell, size, compact }: { cell: CellFit; size: string; compact: boolean }) {
  const pct = Math.min(cell.loftMm / Math.max(cell.maxLoftMm, 1), 1) * 100;
  const bar = cell.status === "over" ? "bg-red-500" : cell.status === "compressed" ? "bg-amber-500" : "bg-emerald-500";
  const tone = FIT_TONE[cell.status as Exclude<FitStatus, "ok">];
  return (
    <div
      className={`flex w-full flex-col gap-0.5 rounded border bg-background/90 px-1.5 py-0.5 shadow-sm ${compact ? "text-[9px] leading-4" : "text-[11px] leading-5"}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={cell.maxLoftMm}
      aria-valuenow={cell.loftMm}
      aria-label={`${cell.section} ${cell.subSection} loft`}
      data-xray-loft-gauge={cell.status}
    >
      <div className="flex items-center gap-1 tabular-nums">
        <span>
          {Math.round(cell.loftMm)} / {Math.round(cell.maxLoftMm)} mm
        </span>
        {cell.status !== "ok" && <span className={`capitalize ${tone}`}>{cell.status}</span>}
        {cell.status !== "ok" && <FitWarning status={cell.status} message={fitMessage(cell, size)} className="ml-auto" />}
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const FIT_TONE: Record<Exclude<FitStatus, "ok">, string> = {
  compressed: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
};

/**
 * A fit problem as a small triangle; the numbers live in its tooltip. Tapping
 * toggles it too — touch has no hover. Advisory only: nothing it marks is refused.
 */
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
          <AlertTriangle className="size-3 max-md:size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        {message}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A piece's type + size, written inside it: white with a dark halo so it reads
 * on every family color. Sized to the piece, and dropped when the piece is too
 * small to hold a legible label — the chips and the pack list still name it.
 */
export function PieceLabel({ rect, lines }: { rect: PieceRect; lines: string[] }) {
  // The x-ray scales with its box, so a phone stage (~360px for 664 view units)
  // needs bigger view-unit text to land at the same ~10px as a desktop card.
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

/**
 * One layer row (staff dive): the cell's pieces at one depth, draggable to
 * reorder the cell top→deep. Sits on the cell it controls, so it needs no leader
 * line back to its pouches.
 *
 * `id` must be the layer's IDENTITY, not its depth (`layerSortableId`): dnd-kit
 * animates the dropped row from where it projected it to where React re-renders
 * it, so a positional id — which stays at the same index after a reorder writes
 * — makes every successful drag flip back to the slot it came from.
 *
 * The grip is the row's LAST control. It is the one thing here that is dragged
 * rather than tapped, so it sits at the thumb end of the row on a phone, and
 * away from the labels that the +/× controls belong to.
 */
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
  /** `section/subSection`: a pouch dragged onto this row lands in this Layer (slice 07). */
  dropCell: string;
  pieces: Array<{ slot: number; label: string }>;
  full: boolean;
  /** This layer's width problem, if any: a triangle with the numbers on hover. */
  warning?: { status: FitStatus; message: string };
  /** The selected piece's slot when it is in this cell (slice 06): its label reads pressed. */
  selectedSlot: number | null;
  onAdd: () => void;
  onRemoveLayer: () => void;
  onRemovePiece: (slot: number) => void;
  /** A row's label selects its piece — the rows sit ON the pouches, so the outline under them cannot be reached. */
  onSelectPiece: (slot: number) => void;
  /** The label is also the piece's drag handle — press and drag it anywhere on the pillow. */
  pieceDragHandle: (slot: number) => React.DOMAttributes<Element>;
}) {
  const { ref, isDragging, handleRef } = useSortable<HTMLDivElement>({ id, index });
  return (
    <div
      ref={ref}
      data-drop-cell={dropCell}
      data-drop-layer={depth}
      className={`pointer-events-auto flex w-full items-center gap-1 px-1 max-md:gap-1.5 max-md:px-1.5 ${LAYER_ROW_CLASS} ${isDragging ? "z-50 opacity-70 shadow-lg" : ""}`}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">{depth + 1}</span>
      {warning && <FitWarning status={warning.status} message={warning.message} />}
      {/* Desktop NEVER wraps. The panel is an absolutely positioned box inside a
          fixed aspect-ratio, overflow-hidden frame, so a row that wraps grows the
          panel VERTICALLY until it is clipped off the frame and its controls stop
          being clickable — at three layers of two pieces, well under every cap.
          Labels truncate instead; the phone dock has the width to wrap. */}
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:flex-wrap">
        {pieces.map((piece) => (
          <span
            key={piece.slot}
            className={`flex min-w-0 items-center gap-0.5 rounded pl-1.5 ${piece.slot === selectedSlot ? "bg-sky-400/30 ring-1 ring-sky-400" : "bg-muted"}`}
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
        // touch-none: a long-press drag on a phone must not scroll the page instead.
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
  className,
}: {
  placements: PillowPlacement[];
  /** item id → subtype (resolves fluid shape + color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size, written in the piece's label; absent ids show the type alone. */
  itemSizes?: ReadonlyMap<number, string | null>;
  /** item id → registry dimensions (slice 02): the pouch's drawn footprint; absent ids draw as the generic pouch. */
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  /** The pillow Size: sets the silhouette, the Section columns and the mm → view scale. */
  pillowSize?: PillowSize;
  /** The loft allowance the fit budgets with (a Settings value, slice 12); the code default when omitted. */
  loftAllowance?: number;
  /** The host's fit (`usePillowFit`), shared with its banner, confirm and cross-section; computed here when omitted. */
  fit?: PillowFit;
  /** The dived Section, as it changes — an along cut follows it. */
  onDiveChange?: (section: Section | null) => void;
  /** Inventory filling Items for the dive editor picker; read-only when omitted. */
  items?: FillingItem[];
  /** Same lifted session-mix state the list editor writes (never forked). */
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  /** Desktop: render the dive controls into this element instead of over the pillow art. */
  controlsSlot?: HTMLElement | null;
  className?: string;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // Read by the Escape handler and by Mirror's Undo — both fire from outside
  // React's render, where the captured `placements` would already be stale.
  const draggingRef = useRef(false);
  const placementsRef = useRef(placements);
  const [hovered, setHovered] = useState<Section | null>(null);
  const [dived, setDived] = useState<Section | null>(null);
  // Which sub-section's Add-filling menu is blooming (one at a time), and which
  // cell the pointer/keyboard is on — the add target is the whole cell, so both
  // drive on-canvas affordances rather than a per-cell button.
  const [openSub, setOpenSub] = useState<SubSection | null>(null);
  // Which layer the blooming picker adds into: null = anywhere in the cell (a
  // click on the cell art), n = that layer exactly, layers.length = a new one.
  const [openLayer, setOpenLayer] = useState<number | null>(null);
  const [hoverSub, setHoverSub] = useState<SubSection | null>(null);
  // The selected pouch (slice 06): moves act on it; cleared on dive exit, on a
  // Section switch and by Escape (before the Escape that ends the dive).
  const [selected, setSelected] = useState<PieceRef | null>(null);
  const selectedRef = useRef(selected);
  // A pouch drag in flight (slice 07): pointer events on the pouch's own hit
  // path, resolved through the pure adapter on drop — never a second dnd-kit
  // provider (the layer rows own one per cell for their sort).
  const [drag, setDrag] = useState<PouchDrag | null>(null);
  const dragRef = useRef<PouchDrag | null>(null);
  const [layerPick, setLayerPick] = useState<LayerPick | null>(null);
  const justDraggedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const editable = Boolean(items && onPlacementsChange);
  // Phones: a cell is ~65px tall on a 360px stage, so controls parked ON the
  // cells collide with their neighbours at any font size. Below md the dive
  // keeps the on-pillow cell highlight + tap-to-add, and the chips, toggle,
  // layer rows and add-layer move into a dock right under the pillow.
  const isMobile = useIsMobile();
  const slotted = Boolean(controlsSlot) && !isMobile;
  // Ring 1 = filling family (3D/6D/6D+), leaves = deduped inventory items.
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    onDiveChange?.(dived);
  }, [dived, onDiveChange]);

  // Leaving the dive takes the open picker and the cell hover with it — the
  // cell hit areas unmount, so no mouseleave would ever fire to clear them.
  const endDive = useCallback(() => {
    setDived(null);
    setOpenSub(null);
    setOpenLayer(null);
    setHoverSub(null);
    setSelected(null);
  }, []);

  /** Open the add-filling bloom on a cell, targeting one of its layers. */
  const openPicker = useCallback((subSection: SubSection, layer: number | null) => {
    setOpenLayer(layer);
    setOpenSub(subSection);
  }, []);

  // Exit the dive on Escape or a click anywhere outside the pillow — no CTA needed.
  useEffect(() => {
    if (!dived) return;
    const onKey = (e: KeyboardEvent) => {
      // A drag in flight owns Escape: dnd-kit cancels the drag with it, and
      // unmounting the dive (and the sortable tree with it) mid-drag both loses
      // the gesture's meaning and tears down hooks React is still committing.
      if (e.key === "Escape" && !draggingRef.current) {
        // A selection is cleared first; the next Escape leaves the dive.
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
      // Toasts are portalled to the document, so every one of this editor's own
      // confirmations reads as "outside" — including Mirror's Undo, which would
      // then close the dive out from under the staff member using it.
      if (target instanceof Element && target.closest("[data-sonner-toaster]")) return;
      endDive();
    };
    // CAPTURE phase: dnd-kit's own Escape handler cancels the drag and fires
    // drag-end, which clears draggingRef — on the very event this handler is
    // reading it. Running first is what makes the guard above mean anything.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [dived, endDive, controlsSlot]);

  // The Size's stage: silhouette, Section columns and cell regions (slice 02).
  const stage = useMemo(() => stageGeometry(pillowSize), [pillowSize]);
  // layoutPlacements + conformPouchPath are pure and deterministic, so the whole
  // geometry chain memoises on (placements, stage, itemDims): a hover/dive
  // re-render no longer re-runs the pouch conform (polygon scans) for every piece.
  // The physical fit (slice 03): the host's when it computes one (its banner,
  // confirm and cross-section read the same object), else computed once here;
  // the layout (squeezed widths and thicknesses draw as such), the rings and
  // the gauges read it — never recomputed downstream.
  const fit = useMemo(
    () => fitProp ?? fitPillow(placements, { size: pillowSize, dims: itemDims, loftAllowance }),
    [fitProp, placements, pillowSize, itemDims, loftAllowance],
  );
  const pieces = useMemo(
    () => layoutPlacements(placements, { stage, dims: itemDims, fit }),
    [placements, stage, itemDims, fit],
  );
  const rectByKey = useMemo(() => new Map(pieces.map((pl) => [pl.key, pl] as const)), [pieces]);
  /** piece key → its own squeeze (slice 04): dashed stroke, red tint and the ↕ / ↔ micro-label read this. */
  const pieceStatuses = useMemo(
    () => new Map(pieces.map((p) => [p.key, pieceFitStatus(fit, p, p.depth)] as const)),
    [pieces, fit],
  );
  /** cell key → its pieces, in layout order (one grouping pass, not a filter per cell). */
  const piecesByCell = useMemo(() => {
    const byCell = new Map<CellKey, typeof pieces>();
    for (const p of pieces) {
      const key = `${p.section}/${p.subSection}` as CellKey;
      const list = byCell.get(key);
      if (list) list.push(p);
      else byCell.set(key, [p]);
    }
    return byCell;
  }, [pieces]);
  const cellsInUse = useMemo(() => [...piecesByCell.keys()], [piecesByCell]);
  /**
   * Section → its pieces deepest-first (then cell order, then slot): the paint
   * order of both views, so a top Layer paints over a deeper neighbour that
   * settled under it (slice 11).
   */
  const piecesBySection = useMemo(() => {
    const bySection = new Map<Section, PieceLayout[]>();
    for (const section of SECTIONS) {
      const list = pieces.filter((p) => p.section === section);
      if (list.length === 0) continue;
      list.sort(
        (a, b) =>
          b.depth - a.depth ||
          SUB_SECTIONS.indexOf(a.subSection) - SUB_SECTIONS.indexOf(b.subSection) ||
          a.slot - b.slot,
      );
      bySection.set(section, list);
    }
    return bySection;
  }, [pieces]);
  const sectionsInUse = useMemo(() => [...piecesBySection.keys()], [piecesBySection]);
  /**
   * piece key → outline at its SETTLED rect, conformed to silhouette ∩ Section
   * (only the Section walls are walls): the default view everywhere, computed
   * once per geometry change.
   */
  const settledPaths = useMemo(() => {
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
  /**
   * piece key → outline at its AUTHORED rect, conformed to silhouette ∩ cell:
   * the dived Section only, whose crisp cells the drop targets and chips refer
   * to. Empty when nothing is dived, so a read-only x-ray never pays for it.
   */
  const authoredPaths = useMemo(() => {
    const paths = new Map<string, string>();
    if (!dived) return paths;
    const { sil: SIL_REGION, cells: CELL_REGIONS } = stageRegions(stage);
    for (const [key, cellPieceList] of piecesByCell) {
      if (!key.startsWith(`${dived}/`)) continue;
      const regions = [SIL_REGION, CELL_REGIONS[key]];
      for (const p of cellPieceList) {
        const shape = fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape;
        paths.set(p.key, conformPouchPath(p, regions, shape));
      }
    }
    return paths;
  }, [piecesByCell, itemSubtypes, stage, dived]);

  // Labels sit on the drawn body (the conformed outline's centroid), not on
  // the rect's centre — a compartment-filling pouch is cut by the notch.
  const labelRects = useMemo(() => {
    const out = new Map<string, PieceRect>();
    for (const p of pieces) {
      if (p.depth !== 0) continue;
      const d = (p.section === dived ? authoredPaths : settledPaths).get(p.key);
      if (d) out.set(p.key, labelRectOf(d));
    }
    return out;
  }, [pieces, dived, authoredPaths, settledPaths]);  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  // Dive keeps the x-ray fixed over the shell (no pan/zoom): neighbors dim and
  // the editor overlay aligns to the dived column in place.
  const divedIdx = dived ? SECTIONS.indexOf(dived) : -1;
  // The column the dived section mirrors into; -1 for center, which has no pair
  // and therefore no bar to place. Never the dived column, which owns the panels.
  const mirrorIdx = dived ? SECTIONS.indexOf(mirrorTarget(dived) ?? "center") : -1;

  const addToCell = (cell: Cell, itemId: number, layer: number | null) => {
    const result = addPiece(placements, cell, itemId, layer);
    if (!result.ok) {
      toast.error(result.error); // cap / rule feedback, visible on-canvas
      return;
    }
    // Fit never refuses: an overfull cell turns amber/red and its layer warns.
    onPlacementsChange?.(result.placements);
  };

  const pieceLabel = (itemId: number) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? fillingLabel(item) : `Item #${itemId}`;
  };

  /** The dived cell's fit, for its gauge; undefined while the cell is empty. */
  const cellFitOf = (subSection: SubSection): CellFit | undefined =>
    dived ? fit.cells.find((c) => c.section === dived && c.subSection === subSection) : undefined;

  /** A stacked layer's width problem, for its row's warning triangle. */
  const layerWarning = (subSection: SubSection, depth: number) => {
    const cell = cellFitOf(subSection);
    const layer = cell?.layers.find((l) => l.depth === depth);
    return cell && layer && layer.status !== "ok" ? { status: layer.status, message: layerFitMessage(cell, layer) } : undefined;
  };

  /** The selection, only while the piece still exists (a remove leaves the state behind). */
  const selectedPiece: (PieceRef & { itemId: number }) | null = useMemo(() => {
    if (!selected) return null;
    const p = placements.find((q) => q.section === selected.section && q.subSection === selected.subSection && q.slot === selected.slot);
    return p ? { ...selected, itemId: p.itemId } : null;
  }, [selected, placements]);
  const selectedKey = selectedPiece ? `${selectedPiece.section}/${selectedPiece.subSection}/${selectedPiece.slot}` : null;

  const fitCtx = { size: pillowSize, dims: itemDims, loftAllowance };

  /**
   * Write a successful move (key or drag): the selection follows the
   * piece, and Undo is the Mirror pattern — an inverse applied only while the
   * move is still the last thing that happened.
   */
  const commitMove = (
    before: PillowPlacement[],
    next: PillowPlacement[],
    ref: PieceRef & { itemId: number },
    nextRef: PieceRef,
    nudged = false,
  ) => {
    onPlacementsChange?.(next);
    setSelected(nextRef);
    // A dive follows the pouch across Sections, so it stays in view, selected.
    if (dived && nextRef.section !== dived) setDived(nextRef.section);
    const label = pieceLabel(ref.itemId);
    // One toast id: a run of nudges or moves updates one toast (its Undo the latest), never a stack.
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

  /**
   * Put a pouch at a top-left corner in its cell (slice 08): clamped to the
   * room its neighbours leave it (the layout's range), stored as mm from home,
   * so what is saved is what is drawn. Nothing when it has no room to move.
   */
  const nudgeTo = (ref: PieceRef & { itemId: number }, x: number, y: number) => {
    const p = rectByKey.get(`${ref.section}/${ref.subSection}/${ref.slot}`);
    if (!p || !onPlacementsChange) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    const before = placements;
    // Stored as M millimetres (the reference Size), as the layout reads them.
    const f = sizeFactors(PILLOW_DIMENSIONS[pillowSize]);
    const next = nudgePiece(before, ref, {
      xMm: (clamp(x, p.range.minX, p.range.maxX) - p.home.x) / (stage.k * f.across),
      yMm: (clamp(y, p.range.minY, p.range.maxY) - p.home.y) / (stage.k * f.along),
    });
    if (next !== before) commitMove(before, next, ref, ref, true);
  };

  /**
   * One move of the selected pouch, from a key: the pure functions
   * decide (caps first, then the fit), the refusal rides the same toast path
   * as an add, the selection follows the piece.
   */
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
      toast.error(error); // cap feedback, the add's path
      return;
    }
    if (next === before) return;
    commitMove(before, next, ref, nextRef);
  };
  const nudgeBy = (step: { xMm: number; yMm: number }) => {
    const ref = selectedPiece;
    const p = ref && rectByKey.get(`${ref.section}/${ref.subSection}/${ref.slot}`);
    if (ref && p) nudgeTo(ref, p.x + step.xMm * stage.k, p.y + step.yMm * stage.k);
  };
  const nudgeByRef = useRef(nudgeBy);
  const performMoveRef = useRef(performMove);
  useEffect(() => {
    performMoveRef.current = performMove;
    nudgeByRef.current = nudgeBy;
  });

  // --- Pouch drag (slices 06/07) -----------------------------------------------
  // The drag IS the move vocabulary (the move pad went with Ivan's 27-9-2026
  // review; the keys stay). A press on a pouch — its outline on the pillow, or
  // its label chip / layer-row label, which sit over it — starts a candidate
  // drag; it becomes a drag once the pointer travels DRAG_THRESHOLD_PX (a click
  // still selects). While dragging, the element under the pointer names the
  // drop target (the nine cell regions of every Section, the layer rows, the
  // add-layer button — all tagged), the hovered cell highlights (red when the
  // fit says it cannot close) and a ghost of the outline follows the pointer.
  // On release `planPouchDrop` decides: a side-by-side cell takes the pouch at
  // the drop's position in the row (its own cell: a reorder), a stacked cell
  // blooms a Layer picker, a layer row is that Layer — all through `movePiece`.
  /** Client px → view units, through the SVG's own transform (letterboxing included). */
  const toView = (clientX: number, clientY: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f };
  };
  const startDrag = (e: React.PointerEvent<Element>, ref: PieceRef, fromPouch: boolean) => {
    if (!editable || e.button !== 0) return;
    const key = `${ref.section}/${ref.subSection}/${ref.slot}`;
    const p = rectByKey.get(key);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    justDraggedRef.current = false;
    const at = toView(e.clientX, e.clientY);
    const d: PouchDrag = {
      source: { section: p.section, subSection: p.subSection, slot: p.slot, depth: p.depth, itemId: p.itemId },
      key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: fromPouch ? at.x - (p.x + p.w / 2) : 0,
      grabY: fromPouch ? at.y - (p.y + p.h / 2) : 0,
      x: at.x,
      y: at.y,
      active: false,
      over: null,
      overfull: false,
    };
    dragRef.current = d;
    setDrag(d);
  };
  const moveDrag = (e: React.PointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
    if (!d.active) {
      draggingRef.current = true; // Escape now cancels the drag, not the dive
      setSelected({ section: d.source.section, subSection: d.source.subSection, slot: d.source.slot });
    }
    const over = dropTargetFromElement(document.elementFromPoint(e.clientX, e.clientY));
    const dest = pouchDropDestination(d.source, over);
    const overfull = dest
      ? wouldFit(placements, { kind: "move", from: d.source, to: dest }, fitCtx).cell?.status === "over"
      : false;
    const next: PouchDrag = { ...d, ...toView(e.clientX, e.clientY), active: true, over, overfull };
    dragRef.current = next;
    setDrag(next);
  };
  const endDrag = (e: React.PointerEvent<Element>, canceled: boolean, onTap?: () => void) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!d.active) {
      // A click: the element's onClick selects — except a finger on a pouch,
      // whose click the touchstart guard below suppresses; the tap acts here.
      if (!canceled && e.pointerType === "touch") onTap?.();
      return;
    }
    draggingRef.current = false;
    justDraggedRef.current = !canceled; // the click that follows the drop must not re-select the old ref
    const over = canceled ? null : d.over;
    const cell = over && { section: over.section, subSection: over.subSection };
    const layers = cell ? cellLayers(placements, cell) : [];
    // The drop's position in a side-by-side row, among the row's other pouches.
    const row = (layers[0] ?? []).filter((q) => !sameRef(q, d.source));
    const index =
      cell && layers.length <= 1
        ? dropIndex(
            row.flatMap((q) => {
              const r = rectByKey.get(`${q.section}/${q.subSection}/${q.slot}`);
              return r ? [{ cx: r.x + r.w / 2, cy: r.y + r.h / 2, h: r.h }] : [];
            }),
            d.x - d.grabX,
            d.y - d.grabY,
          )
        : undefined;
    const sourceIndex = (layers[0] ?? []).findIndex((q) => sameRef(q, d.source));
    const plan = planPouchDrop(d.source, over, { layerCount: layers.length, index, sourceIndex: sourceIndex < 0 ? undefined : sourceIndex }, canceled);
    if (!plan) return;
    if (plan.kind === "nudge") {
      // Its own cell: the pouch goes where its ghost was let go, within the free space.
      const p = rectByKey.get(d.key);
      if (p) nudgeTo(d.source, d.x - d.grabX - p.w / 2, d.y - d.grabY - p.h / 2);
      return;
    }
    if (plan.kind === "chooseLayer") {
      const box = rootRef.current?.getBoundingClientRect();
      draggingRef.current = true; // the picker owns Escape until it closes
      setLayerPick({
        source: d.source,
        cell: plan.cell,
        left: box && box.width > 0 ? `${((e.clientX - box.left) / box.width) * 100}%` : "50%",
        top: box && box.height > 0 ? `${((e.clientY - box.top) / box.height) * 100}%` : "50%",
      });
      return;
    }
    const r = movePiece(placements, d.source, plan.to);
    if (!r.ok) {
      toast.error(r.error); // cap feedback, the add's path
      return;
    }
    commitMove(placements, r.placements, d.source, r.ref);
  };
  /** Pointer handlers that make an element a handle for one pouch's drag. */
  const dragHandle = (ref: PieceRef, fromPouch = false, onTap?: () => void) => ({
    onPointerDown: (e: React.PointerEvent<Element>) => startDrag(e, ref, fromPouch),
    onPointerMove: moveDrag,
    onPointerUp: (e: React.PointerEvent<Element>) => endDrag(e, false, onTap),
    onPointerCancel: (e: React.PointerEvent<Element>) => endDrag(e, true),
  });
  // `touch-action: none` does not reach SVG shapes in Chromium, so a finger
  // drag on a pouch panned the page and cancelled the drag. A non-passive
  // touchstart on the pouch hit paths only (React's is passive) keeps the page
  // scrollable from anywhere else on the pillow.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !editable) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-pouch-hit]")) e.preventDefault();
    };
    svg.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => svg.removeEventListener("touchstart", onTouchStart);
  }, [editable]);
  /** A tap on a pouch on the pillow: select it, diving into its Section first. */
  const tapPouch = (ref: PieceRef, inDive: boolean) => {
    if (!inDive && !justDraggedRef.current) {
      setDived(ref.section);
      setOpenSub(null);
    }
    selectPiece(ref);
  };
  /** Select a pouch — unless this is the click a drop just released. */
  const selectPiece = (ref: PieceRef) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setSelected(ref);
  };

  // The Layer picker for a drop on a stacked cell: its Layers top → deep, the
  // pouch's own and full ones disabled, then a new Layer under the deepest.
  const layerPickSizes = layerPick ? cellLayers(placements, layerPick.cell).map((l) => l.length) : [];
  const layerPickOwn = layerPick && sameCellRef(layerPick.source, layerPick.cell) ? layerPick.source.depth : null;
  const layerPickTree = layerChoices(layerPickSizes, layerPickOwn, { maxLayers: MAX_LAYERS_PER_CELL, maxPerLayer: MAX_PIECES_PER_LAYER });
  const closeLayerPick = useCallback(() => {
    draggingRef.current = false;
    setLayerPick(null);
  }, []);
  // Escape closes the picker and leaves the pouch where it was (capture phase,
  // ahead of the dive's own guard, which stands down through draggingRef).
  useEffect(() => {
    if (!layerPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeLayerPick();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [layerPick, closeLayerPick]);
  const dropIntoLayer = (choice: string) => {
    const pick = layerPick;
    closeLayerPick();
    if (!pick) return;
    const layer = resolveLayerChoice(choice, layerPickSizes, layerPickOwn);
    const r = movePiece(placements, pick.source, { cell: pick.cell, layer });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    commitMove(placements, r.placements, pick.source, r.ref);
  };
  const cancelDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    draggingRef.current = false;
    setDrag(null);
  }, []);
  // Escape mid-drag cancels the drag and keeps the dive open. Capture phase,
  // like the dive's own guard, which stands down while draggingRef is set.
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

  // Keyboard moves (dive, with a selection): the same moves a drag makes.
  // Text controls keep their arrows; the page keeps its scroll otherwise.
  useEffect(() => {
    if (!dived || !editable || !selectedPiece) return;
    const onMoveKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || draggingRef.current) return;
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

  // Side-by-side chip: collated type label (×count) + remove, floated over the
  // pouch group at its centroid. Stacked cells use the external labels instead.
  const pieceChip = (cell: Cell, itemId: number, slots: number[]) => {
    const label = pieceLabel(itemId);
    const lastSlot = slots[slots.length - 1];
    const on = selectedPiece?.subSection === cell.subSection && slots.includes(selectedPiece.slot);
    // The chip sits on its pouches, so it picks one of them up: the selected one, else the first.
    const ref: PieceRef = { section: cell.section, subSection: cell.subSection, slot: on ? selectedPiece!.slot : slots[0] };
    return (
      <span className={`flex items-center gap-0.5 px-1 ${CHIP_CLASS} ${on ? "ring-1 ring-sky-400" : ""}`}>
        {/* The chip sits on the pouch, so its label is the selection target there (slice 06). */}
        <button
          type="button"
          className="max-w-24 cursor-grab truncate active:cursor-grabbing"
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

  /** A cell at its piece cap takes no more: hover says so instead of adding. */
  const cellIsFull = (subSection: SubSection) =>
    dived !== null &&
    cellPieces(placements, { section: dived, subSection }).length >= MAX_PIECES_PER_CELL;
  /** The cell the add affordance is on right now — an open bloom outranks hover. */
  const addTarget = openSub ?? hoverSub;
  /** Cell centre in container % (the dive overlay's linear view→% map). */
  const cellCenter = (subSection: SubSection) => {
    const b = SUB_SECTIONS.indexOf(subSection);
    return {
      left: `${(((stage.colX[divedIdx] + stage.colX[divedIdx + 1]) / 2) / XRAY_VIEW.width) * 100}%`,
      top: `${(((stage.rowY[b] + stage.rowY[b + 1]) / 2) / XRAY_VIEW.height) * 100}%`,
    };
  };
  /** The dived column's width, as a % of the frame. */
  const divedColumnWidth = `${((stage.colX[divedIdx + 1] - stage.colX[divedIdx]) / XRAY_VIEW.width) * 100}%`;
  /**
   * Where a cell's control panel hangs, and which way it grows. The frame clips
   * (fixed aspect ratio + overflow-hidden), so a panel taller than its own band
   * must grow INWARD — the outer cells anchor to the band edge nearest the
   * middle rather than centring on the cell. A five-layer front cell centred on
   * its own mid-line hangs off the top of the frame, taking its top rows with it.
   *
   * The width is definite rather than shrink-to-fit: an absolutely positioned box
   * at `left: 83%` may only be as wide as the gap to the frame's right edge
   * (~120px), which is what forced each piece onto its own line.
   */
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

  /** Side ↔ Stacked arrangement toggle for a cell with 2+ pieces (overlay + dock). */
  const arrangementToggle = (cell: Cell, subSection: SubSection, stacked: boolean) => (
    <div
      className="pointer-events-auto flex overflow-hidden rounded border text-[9px] leading-4 shadow-sm max-md:text-[11px] max-md:leading-5"
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
            className={`px-1.5 py-0.5 max-md:px-2.5 max-md:py-1 ${on ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
            onClick={() => onPlacementsChange?.(setCellArrangement(placements, cell, mode))}
          >
            {mode === "side" ? "Side" : "Stacked"}
          </button>
        );
      })}
    </div>
  );

  /**
   * Mirror the dived side onto the other one (CONTEXT.md: side-sleep support is
   * the paired thing; back-sleep support sits in center). Center is ON the
   * mirror plane and has no opposite, so it gets no CTA at all rather than a
   * disabled one — there is nothing staff could do to make it apply.
   *
   * The direction is IN the label, not implied by where you tapped: this
   * replaces the whole far side in one click, and "Mirror" alone does not say
   * which side loses its pieces. Undo rides on the toast for the same reason.
   */
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
            : "flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent aria-disabled:opacity-40"
        }
        // aria-disabled, not `disabled`: a disabled button leaves the tab order,
        // so the one thing that explains WHY it does nothing would be unreachable
        // by keyboard. The click is guarded instead.
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
              // An inverse, not a snapshot restore. The toast outlives the click,
              // so a plain `onPlacementsChange(before)` would also silently revert
              // anything edited in between. Only undo while the mirror is still
              // the last thing that happened.
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

  /** Adding a layer IS adding a piece at a new depth, so an empty layer is
      never created and never has to be persisted. */
  const addLayerButton = (cell: Cell, subSection: SubSection, layers: readonly unknown[]) => (
    <button
      type="button"
      // A pouch dropped here starts a new Layer under the deepest (slice 07).
      data-drop-cell={`${cell.section}/${cell.subSection}`}
      data-drop-layer={layers.length}
      className={`pointer-events-auto flex items-center gap-0.5 px-1 hover:bg-accent max-md:min-h-7 max-md:px-2 ${CHIP_CLASS}`}
      aria-label={`Add a layer under ${cell.section} ${subSection}`}
      onClick={() => openPicker(subSection, layers.length)}
    >
      <Layers className={CHIP_ICON_CLASS} />
      Add layer
    </button>
  );


  // Side-by-side cells keep centroid chips (collated per type); stacked cells
  // list their per-piece labels in the cell's own control panel instead.
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

  // Per-sub-section control-panel data for the dived section: the arrangement
  // toggle (2+ pieces), plus the cell's layers top→deep. Every sub-section maps,
  // empty cells included — they still hint. A one-layer cell lists no rows: its
  // pieces already read as centroid chips on the pouches themselves.
  const panels =
    dived === null
      ? []
      : SUB_SECTIONS.map((subSection) => {
          const cell: Cell = { section: dived, subSection };
          const cellPcs = cellPieces(placements, cell);
          const layers = cellLayers(placements, cell);
          return { subSection, cell, cellPcs, stacked: layers.length > 1, layers };
        });
  /**
   * Drag a layer row to a new depth. ONE provider per cell (never one for the
   * dived section): `source.index` is an index within the provider's group, so a
   * provider spanning front/middle/back would both project into the wrong list
   * and let a row be dragged into a cell it cannot move to.
   *
   * `layerDragDestination` carries the two traps this handler used to fall into —
   * reading `operation.target` as the destination, and a positional sortable id.
   */
  const layerDragEnd =
    (cell: Cell, layers: PillowPlacement[][]) => (event: SortableDragEndEvent) => {
      draggingRef.current = false;
      const move = layerDragDestination(layers, event);
      if (!move) return;
      const { from, to } = move;
      onPlacementsChange?.(moveLayer(placements, cell, from, to));
    };

  /** The dived section's controls as a flow layout: the phone dock and the host slot share it. */
  const diveControls = (chrome: string) =>
    dived && (
      <div className={`flex flex-col ${chrome}`}>
        <div className="mb-1 flex shrink-0 flex-wrap items-center gap-2 px-1">
          <span className="text-xs font-semibold capitalize">{dived} section</span>
          <div className="ml-auto flex items-center gap-2">
            {mirrorButton(dived, false)}
            <button
              type="button"
              className="min-h-9 rounded-lg px-3 text-xs font-medium hover:bg-accent"
              onClick={endDive}
            >
              Done
            </button>
          </div>
        </div>
        {/* Its own element, not a sibling of the header: `first:border-t-0`
            below only reaches the first cell when the cells are the first
            children of their container. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panels.map(({ subSection, cell, cellPcs, stacked, layers }) => {
          const full = cellIsFull(subSection);
          return (
            <div
              key={subSection}
              className="flex flex-col gap-1.5 border-t border-border/60 px-1 py-2 first:border-t-0"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {subSection}
                </span>
                {cellPcs.length >= 2 && arrangementToggle(cell, subSection, stacked)}
                <button
                  type="button"
                  disabled={full}
                  className={`ml-auto flex items-center gap-0.5 px-1 hover:bg-accent disabled:opacity-40 max-md:min-h-7 max-md:px-2 ${CHIP_CLASS}`}
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
              {/* Phone parity (slice 04): the same gauge and message in the dock group. */}
              {cellPcs.length > 0 && cellFitOf(subSection) && (
                <LoftGauge cell={cellFitOf(subSection)!} size={pillowSize} compact={false} />
              )}
              {!stacked && cellPcs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sideChips
                    .filter((fc) => fc.subSection === subSection)
                    .map((fc) => (
                      <span key={fc.itemId}>{pieceChip(fc.cell, fc.itemId, fc.slots)}</span>
                    ))}
                </div>
              )}
              {/* One provider per CELL: see layerDragEnd. */}
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
            </div>
          );
        })}
        </div>
      </div>
    );

  return (
    <div ref={rootRef} className={className} style={{ pointerEvents: "none" }}>
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
          {/* x-ray art direction: shell interior darkens so fillings read inside */}
          <g clipPath={`url(#${clipId("sil")})`}>
            <path d={stage.silhouettePath} fill={XRAY_INTERIOR} />

            {/* Two views of one recipe (slice 11). Every Section draws SETTLED —
                fill spread into the empty neighbouring sub-sections, conformed
                to silhouette ∩ Section — except the dived one, which draws its
                AUTHORED cells (nested clipping: silhouette ∩ Section ∩ cell —
                belt only; the pouch geometry itself deforms to stay a seam
                inside every region) over a dashed ghost of where each piece
                settles. A piece keeps its tree position across the flip, so its
                outline morphs instead of remounting. Deepest-first with a depth
                scrim (deeper = darker) so the overlap reads as a stack. */}
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
                    const key = `${p.section}/${p.subSection}` as CellKey;
                    const d = (authored ? authoredPaths.get(p.key) : settledPaths.get(p.key))!;
                    const squeeze = pieceStatuses.get(p.key) ?? RELAXED_PIECE;
                    return (
                      <g key={p.key} clipPath={authored ? `url(#${clipId(key)})` : undefined}>
                        <MorphPiece
                          key={visual.shape}
                          subtype={subtype}
                          visual={visual}
                          d={d}
                          view={authored ? "authored" : "settled"}
                          status={squeeze.status}
                        />
                        {p.depth > 0 && (
                          <path d={d} fill="rgb(2,6,23)" fillOpacity={Math.min(0.14 * p.depth, 0.5)} />
                        )}
                        {/* A piece in a cell that cannot close: red tint (slice 04). */}
                        {squeeze.status === "over" && <path d={d} fill={RING_OVER} fillOpacity={0.3} />}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* The protector's two divider seams — the Section walls, the only
                seams the pillow has (Ivan, 26-9-2026: follow the seam dividers;
                no status rings, no cut line, no dotted guides). Straight, full
                height, silhouette-clipped, in the shell's own stroke. */}
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

            {/* Selection (slice 06): the piece's own outline, together with the
                settled ghost the dive already draws. */}
            {selectedPiece && dived === selectedPiece.section && authoredPaths.has(selectedKey!) && (
              <path
                d={authoredPaths.get(selectedKey!)!}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                data-xray-selected-piece
              />
            )}

            {/* Drag feedback (slice 07): the hovered drop cell highlights in the
                selection blue — red when the drop would leave the cell overfull —
                and a ghost of the pouch's outline follows the pointer. (Blue, not
                the add-target white: white is invisible on the unveiled Section.) */}
            {drag?.active && drag.over && (
              <path
                d={stage.cellClipPaths[`${drag.over.section}/${drag.over.subSection}`]}
                fill={drag.overfull ? RING_OVER : "#38bdf8"}
                fillOpacity={drag.overfull ? 0.25 : 0.18}
                data-xray-drop-hover={drag.overfull ? "overfull" : "ok"}
              />
            )}
            {drag?.active && (authoredPaths.get(drag.key) ?? settledPaths.get(drag.key)) && rectByKey.has(drag.key) && (
              <path
                d={(authoredPaths.get(drag.key) ?? settledPaths.get(drag.key))!}
                transform={`translate(${drag.x - drag.grabX - (rectByKey.get(drag.key)!.x + rectByKey.get(drag.key)!.w / 2)} ${drag.y - drag.grabY - (rectByKey.get(drag.key)!.y + rectByKey.get(drag.key)!.h / 2)})`}
                fill="white"
                fillOpacity={0.35}
                stroke="#38bdf8"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                data-xray-drag-ghost
              />
            )}

            {/* Front-layer labels, at the settled centroid unless the Section is
                dived. A dived Section on a desktop already names its pieces
                with the chips sitting on them, so it drops these. */}
            {pieces.map((p) =>
              p.depth === 0 && !(editable && !isMobile && p.section === dived) ? (
                <PieceLabel
                  key={`label-${p.key}`}
                  rect={labelRects.get(p.key) ?? (p.section === dived ? p : p.settled)}
                  lines={[
                    ...pieceLabelLines(itemSubtypes.get(p.itemId) ?? null, itemSizes?.get(p.itemId) ?? null),
                    ...squeezeLines(pieceStatuses.get(p.key)),
                  ]}
                />
              ) : null,
            )}

            {hovered && hovered !== dived && (
              <path d={stage.sectionHitPaths[hovered]} fill="white" fillOpacity={0.15} />
            )}

            {/* Dive focus: neighbor Sections dim (static veil, silhouette-clipped) */}
            {dived &&
              SECTIONS.filter((s) => s !== dived).map((s) => (
                <path key={s} d={stage.sectionHitPaths[s]} fill={XRAY_VEIL} fillOpacity={0.55} />
              ))}

            {/* The add target is a whole cell, and its highlight IS the cell
                region — clipped to the silhouette, so the affordance can never
                sit outside the shell the way a floating + button did. */}
            {dived && editable && addTarget && (
              <path
                d={stage.cellClipPaths[`${dived}/${addTarget}`]}
                fill="white"
                fillOpacity={cellIsFull(addTarget) ? 0.05 : 0.14}
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

          {/* Section hit areas: hover highlight; click dives (or switches Sections) */}
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
                      setDived(section);
                      setOpenSub(null);
                      setSelected(null);
                    }
                  : undefined
              }
            />
          ))}

          {/* Add hit areas (dived Section only): one per cell, sized to the cell
              ∩ silhouette so the target is a big region you cannot miss — the
              clip also keeps hover and clicks inside the shell. */}
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
                  // The cell's own highlight is the focus indicator, so the
                  // browser's default ring — a box around the path bbox, the
                  // one straight-edged rectangle on this canvas — is dropped.
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

          {/* Pouch hit areas (slices 06/07): every pouch's own outline — the
              dived Section's authored one, every other Section's settled one —
              above the cell add areas, so a press on a pouch picks it up, a
              tap selects it (diving into its Section first) and a tap beside
              it still adds. Focusable in the dive, so keyboard users reach the
              selection too. Deepest-first, so the top Layer wins the hit. */}
          {editable &&
            sectionsInUse.flatMap((section) =>
              (piecesBySection.get(section) ?? []).map((p) => {
                const inDive = section === dived;
                const d = (inDive ? authoredPaths : settledPaths).get(p.key);
                if (!d) return null;
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
                    // touch-action none: a finger drag on a pouch must not scroll the page instead.
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

          {/* Drop targets while a pouch is dragged (slice 07): the nine cell
              regions of every Section, so a drop can cross Sections. The
              pointer is captured by the dragged pouch, so these only exist for
              the hit test under the pointer — they never take an event. */}
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
        </g>
      </svg>

      {/* Dive editor overlay: every control sits ON the cell it edits, so no
          leader lines and nothing to clip. (view coords → HTML %, linear map) */}
      {dived && editable && (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} data-xray-dive>
          {/* Section-level chrome. Every cell panel belongs to the DIVED column,
              so this parks in the top corner of another one and overlap becomes
              structurally impossible — not a guess about how tall the panels
              happen to be. Parked over the column it mirrors INTO, which is the
              one place staff are about to look. Still inside the frame, so it is
              never the clipped gutter the per-cell controls had to move out of. */}
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

          {/* Side-by-side cells: centroid chips over their pouch group. */}
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

          {/* Per-cell control surface, ON the cell it edits. XrayEditor frames
              the pillow at the x-ray's own aspect ratio with overflow-hidden, so
              anything parked in an outside gutter is clipped away on both Admin
              surfaces — staff could not reach the arrangement toggle at all.
              Mounted on piece count, never on hover: focusin/focusout are
              DISCRETE in React and flush synchronously, so a focus-gated panel
              would unmount under the very Tab that reaches it. */}
          {!isMobile &&
            panels.map(({ subSection, cell, cellPcs, stacked, layers }) => {
              const hinting = hoverSub === subSection;
              // The bloom is centred on this same point while it is open, so the
              // cell yields its panel rather than stacking controls under a ring.
              if (openSub === subSection) return null;
              // From ONE piece, not two: that cell's only route to a second
              // layer is the Add-layer button, and a hover-gated button is
              // keyboard-unreachable. The toggle below still waits for two.
              if (cellPcs.length < 1 && !hinting) return null;
              // Slotted: the controls live beside the pillow; the cell keeps only its hover hint.
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
                  {/* Loft gauge (slice 04): used / max mm and the fit message, on the cell. */}
                  {cellPcs.length > 0 && cellFitOf(subSection) && (
                    <LoftGauge cell={cellFitOf(subSection)!} size={pillowSize} compact />
                  )}
                  {/* ponytail: a side cell's centroid chips share this band; the
                      panel's opaque background and z-20 keep the toggle
                      readable. Tighten the chips to max-w-16 if it ever bites. */}
                  {cellPcs.length >= 2 && arrangementToggle(cell, subSection, stacked)}
                  {/* One layer needs no row of its own — its pieces are the
                      centroid chips on the pouches. Rows appear from two up.
                      One provider per CELL: see layerDragEnd. */}
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
                  {/* Out of flow: appearing on hover must not shove the controls. */}
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

          {/* Add-filling picker blooms from the centre of the cell you clicked —
              the whole cell is the trigger, so the menu has none of its own.
              Phones: centred on the stage instead, so an outer column's bloom
              cannot run off the screen edge — and sized to the whole stage,
              not the dive column, with thicker rings and a 44px centre
              trigger so the wedges are thumb-sized. */}
          {openSub && (
            <div
              className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
              style={{
                ...(isMobile ? { left: "50%", top: "50%" } : cellCenter(openSub)),
                width: isMobile
                  ? "100%"
                  : `${((stage.colX[divedIdx + 1] - stage.colX[divedIdx]) / XRAY_VIEW.width) * 100}%`,
                pointerEvents: "auto",
              }}
            >
              <SunburstMenu
                open
                root={fillingTree}
                display="text"
                size={isMobile ? 280 : 220}
                ringWidth={isMobile ? 48 : 40}
                holeRadius={isMobile ? 26 : 18}
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

      {/* Layer picker: a pouch dropped on a stacked cell asks which Layer, in
          a bloom at the drop point (phones: centred, like the add picker, so it
          cannot run off the screen edge). A side-by-side cell never asks. */}
      {layerPick && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
          style={{
            ...(isMobile ? { left: "50%", top: "50%" } : { left: layerPick.left, top: layerPick.top }),
            width: isMobile ? 240 : 190,
            pointerEvents: "auto",
          }}
          data-xray-layer-pick
        >
          <SunburstMenu
            open
            root={layerPickTree}
            display="text"
            size={isMobile ? 240 : 190}
            ringWidth={isMobile ? 52 : 50}
            holeRadius={isMobile ? 26 : 18}
            centerIcon={Layers}
            ariaLabel={`Move ${pieceLabel(layerPick.source.itemId)} into which layer of ${layerPick.cell.section} ${layerPick.cell.subSection}?`}
            onOpenChange={(o) => {
              if (!o) closeLayerPick();
            }}
            onSelect={(leaf) => dropIntoLayer(leaf.id)}
          />
        </div>
      )}

      {/* Phones have no hover cue that the sections are tappable: say so, in the
          gap under the pillow, until a section is dived. */}
      {editable && isMobile && !dived && (
        <p
          className="pointer-events-none absolute inset-x-0 top-full text-center text-[11px] leading-4 text-white/70"
          aria-hidden
        >
          Tap a section to edit · drag a pouch to move it
        </p>
      )}

      {/* Phone dock: the dived section's controls, one group per cell, under the
          pillow. Inside the root so a tap here never counts as "outside" and
          ends the dive; Done does that explicitly (no Escape on a phone). */}
      {dived && editable && isMobile && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2"
          style={{ pointerEvents: "auto" }}
          data-xray-dive-dock
        >
          {/* Bounded and scrollable: three cells of 44px layer rows overrun a
              small phone, and the dock is out of flow so the page cannot scroll
              to reach the bottom of it. The header stays put while the cells scroll. */}
          {diveControls("max-h-[70vh] rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-xl")}
        </div>
      )}
      {/* Host-provided slot (desktop): the same controls beside the pillow, off the art. */}
      {dived && editable && slotted && createPortal(<div data-xray-dive-dock>{diveControls("")}</div>, controlsSlot!)}
    </div>
  );
}
