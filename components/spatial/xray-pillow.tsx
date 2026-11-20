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

// Shell regions pouches deform against: the silhouette (wide seam), each
// cell's boundary (thin seam, matching the pouch-to-pouch gap) for the
// authored view, and each Section's for the settled view (slice 11: only the
// Section walls are walls). One set per Size (slice 02), built on first use
// and shared by every x-ray on the page.
type StageRegions = {
  sil: ConformRegion;
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

/** A pouch placed by hand (a fine offset): the soft settle keeps it where it was put. */
const isNudged = (p: PieceLayout) => p.nudged;

/**
 * Pieces by Section, lowest in the stack first — counted from the floor, so a pouch resting over a lower neighbour's
 * end paints over it — then deepest first, cell order, slot: the paint order of both views.
 */
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

/** The conformed outlines with each soft one in its place, where the soft body drew one. */
function withSoft(conformed: Map<string, string>, soft: ReadonlyMap<string, string> | null): Map<string, string> {
  if (!soft) return conformed;
  const out = new Map(conformed);
  for (const [key, d] of soft) if (out.has(key) && d) out.set(key, d);
  return out;
}

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
// Fit status paint (slice 04): nothing turns red (Ivan, 1-11-2026). A piece
// squeezed or in a cell that cannot close draws with a dashed stroke; the
// gauge and its warning say which, in amber. (The amber / red cell rings went
// with Ivan's 26-9-2026 review: no seams on the pillow but the two dividers.)
const AMBER = "#f59e0b";
// Remove (owner, 15-11-2026): the one red on the x-ray, and it means only "this pouch comes out". A pouch carried
// off the x-ray, or whose bin is under the pointer, draws in the theme's destructive red; fit status still never does.
const REMOVE_RED = "var(--destructive, rgb(220,38,38))";
/** How far past the x-ray's edge a held pouch must be carried before its release takes it out, screen px. */
const REMOVE_MARGIN_PX = 24;
/** Where the remove chip sits beside the hand, screen px. */
const removeChipTransform = (clientX: number, clientY: number) => `translate(${clientX + 16}px, ${clientY + 16}px)`;
const RELAXED_PIECE: PieceFitStatus = { status: "ok", widthRatio: 1, thicknessRatio: 1 };
/** A pouch drag in flight (slice 07). */
type PouchDrag = {
  source: PieceRef & { depth: number; itemId: number };
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where on the pouch it was picked up, in view units from its drawn centre (0 from a label). */
  grabX: number;
  grabY: number;
  /** The outline as drawn when it was picked up, and that outline's centre: the ghost carries it. */
  ghostD: string | null;
  drawnCx: number;
  drawnCy: number;
  /** Its settled centre less its drawn one, front ↔ back (the dive draws the authored rect): where a drop stands it. */
  alongShift: number;
  /** The pointer in view units. */
  x: number;
  y: number;
  /** Where the held pouch's drawn centre is, view units: precise by default (`fine-drag.ts`), the ghost and the drop read it. */
  fine: FineDrag;
  /** How near a place a hand aims for it is pulled onto it now, view units (0 while the hand creeps). */
  snapView: number;
  active: boolean;
  over: PouchDropTarget | null;
  /** The hovered target would leave its cell unable to close. */
  overfull: boolean;
  /** Half its drawn height, view units: the badge clears it. */
  halfH: number;
  /** Screen px a view unit when it was picked up: the snap's reach and the badge's size read it. */
  pxPerView: number;
  /** Its centre at whole millimetres, view units: what the preview and the release are planned at, as the cut's are. */
  planAt: Vec;
  /** What the shown preview was planned for (target, millimetres, snapping): another plan only when it changes. */
  planKey: string;
  /** The pointer, screen px: the remove chip follows it off the x-ray. */
  clientX: number;
  clientY: number;
  /** Carried off the x-ray, past REMOVE_MARGIN_PX and off the dive's controls: its release takes the pouch out. */
  removing: boolean;
};
const sameRef = (p: PieceRef, q: PieceRef) => p.section === q.section && p.subSection === q.subSection && p.slot === q.slot;
const sameCellRef = (p: Cell, q: Cell) => p.section === q.section && p.subSection === q.subSection;

// Dive-editor control sizing. The chips sit ON the pouches, so on a desktop
// stage (650px wide) they stay tiny; below md the stage is ~360px wide and
// there is no hover or precise pointer, so the same chips grow to a readable
// 11px with ~28px icon buttons — the largest that still fits three per cell.
// Docked beside the pillow on a desktop (`md:dock:`), nothing constrains them
// but the panel's width: 14px text and 32px buttons.
export const CHIP_CLASS = "rounded border bg-background/90 shadow-sm text-[9px] leading-4 max-md:text-[11px] max-md:leading-5 md:dock:text-sm md:dock:leading-6";
export const CHIP_ICON_CLASS = "size-2.5 max-md:size-3.5 md:dock:size-4";
export const CHIP_ICON_BUTTON_CLASS = "shrink-0 rounded max-md:flex max-md:size-7 max-md:items-center max-md:justify-center md:dock:flex md:dock:size-8 md:dock:items-center md:dock:justify-center";

// Layer rows are the one control staff DRAG, and a grab that misses scrolls the
// page instead — so they get their own, larger scale rather than the read-mostly
// chip sizing above. Desktop: 20px buttons (was a bare ~10px icon) on a panel
// that still has to fit five rows inside a ~112px cell. Phone: the dock is in
// normal flow with room, so the buttons go to the 44px minimum touch target.
const LAYER_ROW_CLASS =
  "rounded-md border bg-background/95 shadow-sm text-[10px] leading-4 max-md:text-[13px] max-md:leading-6 md:dock:text-sm md:dock:leading-7";
const LAYER_ICON_CLASS = "size-3 max-md:size-4 md:dock:size-4";
const LAYER_ICON_BUTTON_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded max-md:size-11 md:dock:size-9";
/** The add picker's diameter when the editor's controls are slotted beside the art (desktop); the Mbolster's too. */
export const SLOTTED_BLOOM_PX = 300;
const easeOut = (t: number) => t * (2 - t);

/**
 * An Ear Comfort Pad's sewn well seen from above: a circle at the middle of
 * its outline `d` (its area centroid), `share` of its width across — the pad
 * is square, and a cell squeezes it front ↔ back, not the well — never more
 * than 0.8 of its short side. Null for an outline too small to draw one in.
 */
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
export const MorphPiece = memo(MorphPieceImpl, (a, b) =>
  // A pointer move re-renders the x-ray; a pouch whose outline, paint and view are unchanged need not.
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
  /** The piece's own fit (slice 04): a squeezed piece draws with a dashed stroke. */
  status?: FitStatus;
  /** An Ear Comfort Pad's sewn well, as a share of its short side across (Settings › Soft body); 0 draws none. */
  well?: number;
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
    return () => {
      cancelAnimationFrame(raf);
      // A new outline mid-flip (the soft body arriving) cuts the flip short: a crossfade must not leave the piece faded.
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
        // The sewn well: a shaded dip ringed by its seam, where the ear rests.
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

/**
 * A cell that is compressed or over (slice 04), said in a word with the numbers
 * in its triangle's tooltip — only when there is a problem. The loft gauge it
 * replaces (used / max mm and a bar on every cell) was a measurement Staff do
 * not act on; the word is what they need (owner, 7-11-2026).
 */
function CellFitNote({ cell, size, className = "" }: { cell: CellFit; size: string; className?: string }) {
  return <FitNote status={cell.status} message={fitMessage(cell, size)} className={className} data-xray-cell-fit={cell.status} />;
}

/** A fit problem in a word ("Compressed", "Over") with the numbers in its triangle's tooltip; nothing when it fits. The Mbolster's compartment says it the same way. */
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

/** Squeezed and cannot close alike: amber, never red (Ivan, 1-11-2026); the word says which. */
const FIT_TONE: Record<Exclude<FitStatus, "ok">, string> = {
  compressed: "text-amber-600 dark:text-amber-400",
  over: "text-amber-600 dark:text-amber-400",
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
          <AlertTriangle className="size-3 max-md:size-3.5 md:dock:size-4" />
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
      className={`pointer-events-auto flex w-full items-center gap-1 px-1 max-md:gap-1.5 max-md:px-1.5 md:dock:gap-1.5 md:dock:px-2 ${LAYER_ROW_CLASS} ${isDragging ? "z-50 opacity-70 shadow-lg" : ""}`}
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
  softBody = SOFT_BODY_DEFAULTS,
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
  /** The soft body's Settings (ADR 0025), the cross-section's own: pouches settle as soft bodies; off draws the conformed outlines. */
  softBody?: SoftBodySettings;
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
  // The held pouch's ghost and badge, shared with the side view (held-pouch.tsx).
  const heldGhost = useHeldGhost();
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

  // Every dive change goes through here, so the host hears of it in the same
  // event. No host needs a call on mount: they all start from no dive too.
  const changeDive = useCallback(
    (next: Section | null) => {
      setDived(next);
      onDiveChange?.(next);
    },
    [onDiveChange],
  );

  // Leaving the dive takes the open picker and the cell hover with it — the
  // cell hit areas unmount, so no mouseleave would ever fire to clear them.
  const endDive = useCallback(() => {
    changeDive(null);
    setOpenSub(null);
    setOpenLayer(null);
    setHoverSub(null);
    setSelected(null);
  }, [changeDive]);

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
  // What every edit reads: the committed recipe's layout (the drop targets, the chips, the moves).
  const pieces = useMemo(
    () => layoutPlacements(placements, { stage, dims: itemDims, fit }),
    [placements, stage, itemDims, fit],
  );
  const rectByKey = useMemo(() => new Map(pieces.map((pl) => [pl.key, pl] as const)), [pieces]);

  // Linked views (xray-link.ts): while a pouch is in hand — dragged here, or on the cross-section — both views
  // draw what its release would commit. Everything below that DRAWS reads `shown`; every edit reads the above.
  const [ownDraft, setOwnDraft] = useState<XrayDraft | null>(null);
  const linked = useXrayDraft(placements);
  const draft = ownDraft ?? (linked?.from === "cut" ? linked : null);
  const shownFit = draft?.fit ?? fit;
  const shownPieces = useMemo(
    () => (draft ? layoutPlacements(draft.placements, { stage, dims: itemDims, fit: draft.fit }) : pieces),
    [draft, pieces, stage, itemDims],
  );
  /** piece key → its own squeeze (slice 04): the dashed stroke reads this. */
  const pieceStatuses = useMemo(
    () => new Map(shownPieces.map((p) => [p.key, pieceFitStatus(shownFit, p, p.depth)] as const)),
    [shownPieces, shownFit],
  );
  /** cell key → its pieces, in layout order (one grouping pass, not a filter per cell). */
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
  /**
   * Section → its pieces lowest in the stack first (then deepest first, cell
   * order, slot): the paint order of both views, so a pouch higher up paints
   * over a lower neighbour whose end it rests on.
   */
  const piecesBySection = useMemo(() => bySection(shownPieces), [shownPieces]);
  /** The committed pieces by Section: their hit areas stay put while a preview moves, so a held one is never unmounted. */
  const hitPiecesBySection = useMemo(() => (shownPieces === pieces ? piecesBySection : bySection(pieces)), [shownPieces, pieces, piecesBySection]);
  const sectionsInUse = useMemo(() => [...new Set([...piecesBySection.keys(), ...hitPiecesBySection.keys()])], [piecesBySection, hitPiecesBySection]);
  /**
   * piece key → outline at its SETTLED rect, conformed to silhouette ∩ Section
   * (only the Section walls are walls): the default view everywhere, computed
   * once per geometry change. Where the soft body settles from, and what
   * draws without it.
   */
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
  /**
   * piece key → outline at its AUTHORED rect, conformed to silhouette ∩ cell:
   * the dived Section only, whose crisp cells the drop targets and chips refer
   * to. Empty when nothing is dived, so a read-only x-ray never pays for it.
   */
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

  /**
   * The soft body, as the cross-section draws it (ADR 0025; soft-top.ts): one
   * plane per height of each Section's stack (from the floor, as the cut
   * stacks it), pressed into silhouette ∩ that Section, settled from the
   * conformed outlines. Stuffed, not layered (9-11-2026): Front, Middle and
   * Back at one height press on each other end to end where the settle stood
   * them, each pushing back for the length it was pressed out of. Every map below reads the soft outline where there is one, so
   * drawing, labels, hit areas and the drag ghost all follow it.
   */
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
  // A preview re-settles on every pointer step: settled quickly and eased quickly, so the pouches flow with the
  // hand; the release eases into the full settle.
  const inHand = draft !== null;
  const softSettings = useMemo(() => (inHand ? draftSoftBody(softBody) : softBody), [inHand, softBody]);
  const softSettled = useSoftTopPaths(settledPlanes, softSettings, XRAY_VIEW, inHand ? HELD_EASE_MS : undefined);
  const softAuthored = useSoftTopPaths(authoredPlanes, softSettings, XRAY_VIEW, inHand ? HELD_EASE_MS : undefined);
  const settledPaths = useMemo(() => withSoft(settledConformed, softSettled), [settledConformed, softSettled]);
  const authoredPaths = useMemo(() => withSoft(authoredConformed, softAuthored), [authoredConformed, softAuthored]);

  // Labels sit on the drawn body (the conformed outline's centroid), not on
  // the rect's centre — a compartment-filling pouch is cut by the notch. An
  // ear pad's sits beside its well (below it, or above when that has more
  // room), so the well stays in view.
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

  /** The dived cell's fit, for its fit note; undefined while the cell is empty. */
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

  const fitCtx = useMemo(() => ({ size: pillowSize, dims: itemDims, loftAllowance }), [pillowSize, itemDims, loftAllowance]);

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
    if (dived && nextRef.section !== dived) changeDive(nextRef.section);
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
   * Where a pouch put down in its own Section stands (slice 08, linked views
   * 7-11-2026): across, at `cx` (its drawn centre) within the room its
   * neighbours leave it; front ↔ back, its settled centre at `centreMm` from
   * the Section's front, through the cut's own writer (`placeAlongAt`), so
   * both views draw it in the same place — anywhere its Layer leaves free,
   * never into a neighbour of its own Layer. The sub-section follows its
   * centre. Stored as mm from home, so what is saved is what is drawn.
   */
  const placeTop = (ref: PieceRef, cx: number, centreMm: number, snapView = 0): (Extract<MoveResult, { ok: true }> & { snap?: AlongSnap }) | null => {
    const p = rectByKey.get(`${ref.section}/${ref.subSection}/${ref.slot}`);
    const placed = placements.find((q) => sameRef(q, ref));
    if (!p || !placed) return null;
    const f = sizeFactors(PILLOW_DIMENSIONS[pillowSize]);
    let x = Math.min(Math.max(cx - p.w / 2, p.range.minX), Math.max(p.range.minX, p.range.maxX));
    // Within a snap of its home across, it goes home (its across offset cleared).
    if (snapView > 0 && Math.abs(x - p.home.x) <= snapView) x = p.home.x;
    // Across first (stored as M millimetres, as the layout reads them), then front ↔ back from where the settle stands it.
    const across = nudgePiece(placements, ref, { xMm: (x - p.home.x) / (stage.k * f.across), yMm: placed.offsetYMm ?? 0 });
    const r = placeAlongSnapped(across, ref, centreMm, snapView, false);
    const next = r ?? { ok: true as const, placements: across, ref };
    return next.placements === placements ? null : next;
  };
  /**
   * Stand a pouch's settled centre at `centreMm` (`placeAlongAt`), pulled onto
   * its home, a column's middle or a column's edge when within `snapView`
   * (view units; 0 places it exactly) — the cut's own snap.
   */
  const placeAlongSnapped = (base: PillowPlacement[], ref: PieceRef, centreMm: number, snapView: number, keepCell: boolean) => {
    const here = alongExtent(settlePillow(base, fitCtx), ref);
    if (!here) return null;
    const len = here.endMm - here.startMm;
    const snapMm = snapView / stage.k;
    const { centreMm: at, snap } = snapAlongCentre(centreMm, len, here.cellLengthMm, snapMm > 0 ? homeCentreMm(base, ref, fitCtx) : null, snapMm);
    const r = placeAlongAt(base, ref, at - len / 2, fitCtx, keepCell);
    return r ? { ...r, ...(snap ? { snap } : {}) } : snap ? { ok: true as const, placements: base, ref, snap } : null;
  };
  /** Commit `placeTop`: the toast says it stayed within its cell, or moved on to the one its centre reached. */
  const nudgeTo = (ref: PieceRef & { itemId: number }, cx: number, centreMm: number) => {
    const r = placeTop(ref, cx, centreMm);
    if (r) commitMove(placements, r.placements, ref, r.ref, sameCellRef(r.ref, ref));
  };

  /** The selected pouch's bin is under the pointer (its key): the pouch previews in red, as one carried off does. */
  const [binHover, setBinHover] = useState<string | null>(null);
  const removeChipRef = useRef<HTMLDivElement>(null);
  /**
   * Take one pouch out (owner, 15-11-2026): its bin on the x-ray, Delete or Backspace with it selected, or a drag off
   * the x-ray. Undo is a move's: an inverse applied only while the remove is still the last thing that happened.
   */
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
    if (!ref || !p) return;
    if (step.yMm) {
      // Front ↔ back is the cut's own nudge (`nudgeSlab`): both views take the same step and stop at the same wall.
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
  /**
   * Whether the hand has carried a held pouch off the x-ray to take it out: past the frame's edge by
   * REMOVE_MARGIN_PX, so a pouch pushed hard against a wall is not lost, and not over the dive's own controls (beside
   * the pillow, or under it on a phone), where a drop that misses a layer row should do nothing, not remove.
   */
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
    // What it is picked up as: the dive draws its authored rect, everywhere else its settled one.
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
      // The side view's hold (held-pouch.tsx): the same fine drag, at this drawing's scale.
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

  /**
   * What releasing a drag here would do (slice 07; linked views 7-11-2026;
   * precise by default 8-11-2026): the same plan for the live preview on
   * every pointer move and for the release, so what both views show while it
   * is held is what lands. The held pouch's centre (`d.fine`) is where it
   * goes: its own cell → as far as there is room (`placeTop`); another cell →
   * onto its top Layer with room, at its place in that row, front ↔ back
   * where it is held. A layer row in the dive panel names that Layer. Near
   * home, a column's middle or edge it is pulled onto it (`d.snapView`).
   */
  type DropPlan =
    | { kind: "none" }
    | { kind: "refused"; error: string }
    | { kind: "move"; placements: PillowPlacement[]; ref: PieceRef; within: boolean; snap?: AlongSnap };
  const planDrop = (d: PouchDrag, over: PouchDropTarget | null, canceled: boolean): DropPlan => {
    const cell = over && { section: over.section, subSection: over.subSection };
    const layers = cell ? cellLayers(placements, cell) : [];
    // The drop's position in its row — the target's top Layer — among that row's other pouches.
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
    // Its settled centre where it is held, mm from the Section's front.
    const centreMm = (cy + d.alongShift - stage.rowY[0]) / stage.k;
    if (plan.kind === "nudge") {
      const r = placeTop(d.source, cx, centreMm, d.snapView);
      return r ? { kind: "move", placements: r.placements, ref: r.ref, within: sameCellRef(r.ref, d.source), snap: r.snap } : { kind: "none" };
    }
    const moved = movePiece(placements, d.source, plan.to);
    if (!moved.ok) return { kind: "refused", error: moved.error };
    // The cell is the drop's; front ↔ back it stands where it is held.
    const placed = placeAlongSnapped(moved.placements, moved.ref, centreMm, d.snapView, true);
    const next = placed ?? moved;
    return { kind: "move", placements: next.placements, ref: next.ref, within: false, snap: placed?.snap };
  };

  /** Show `plan` in both views while the pouch is held (or the committed recipe, when it would change nothing). */
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
  /** The snap the shown preview took, for the badge; and a hand that slows on it creeps on from it. */
  const [draftSnap, setDraftSnap] = useState<AlongSnap | null>(null);
  const snapHeld = useRef<readonly [number, number] | null>(null);

  const moveDrag = (e: React.PointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active && !pastThreshold([d.startX, d.startY], e)) return;
    if (!d.active) {
      draggingRef.current = true; // Escape now cancels the drag, not the dive
      setSelected({ section: d.source.section, subSection: d.source.subSection, slot: d.source.slot });
    }
    const at = toView(e.clientX, e.clientY);
    // The side view's hold (held-pouch.tsx), both ways here (across and front ↔ back are both millimetres): the held
    // pouch stays where it was picked up under a brisk hand, a creeping hand moves it a fraction of its travel, and
    // slowing on a snap creeps on from where the snap stood it. The ghost and badge follow at once, without a render.
    const step = stepHold(d.fine, [at.x - d.grabX, at.y - d.grabY], e, snapHeld.current, d.pxPerView);
    if (step.leftSnap) snapHeld.current = null;
    const fine = step.fine;
    heldGhost.place(fine.at);
    // What the pouch is over is what its centre is over — a layer row under the pointer names that Layer.
    const m = svgRef.current?.getScreenCTM();
    const underPointer = dropTargetFromElement(document.elementFromPoint(e.clientX, e.clientY));
    const centreClient = m ? { x: m.a * fine.at[0] + m.c * fine.at[1] + m.e, y: m.b * fine.at[0] + m.d * fine.at[1] + m.f } : { x: e.clientX, y: e.clientY };
    // Carried off the x-ray (owner, 15-11-2026): over nothing, and its release takes it out. A layer row is still a
    // drop target wherever it is, so only a hand off every target removes.
    const removing = !underPointer && offXray(e.clientX, e.clientY);
    const over = removing
      ? null
      : underPointer?.kind === "layer" ? underPointer : dropTargetFromElement(document.elementFromPoint(centreClient.x, centreClient.y));
    // Planned at whole millimetres, as the cut is: the view draws again only when where it would land can change.
    const mm = (v: number) => Math.round(v / stage.k) * stage.k;
    const planAt: Vec = [mm(fine.at[0]), mm(fine.at[1])];
    const target = over ? `${over.section}/${over.subSection}${over.kind === "layer" ? `:${over.depth}` : ""}` : "-";
    const planKey = removing ? "remove" : `${target}|${planAt[0].toFixed(2)}|${planAt[1].toFixed(2)}|${step.snapView > 0 ? 1 : 0}`;
    const next: PouchDrag = { ...d, ...at, fine, snapView: step.snapView, active: true, over, planAt, planKey, clientX: e.clientX, clientY: e.clientY, removing };
    dragRef.current = next;
    // The remove chip follows the hand without a render, as the ghost does.
    removeChipRef.current?.style.setProperty("transform", removeChipTransform(e.clientX, e.clientY));
    if (d.active && planKey === d.planKey) return;
    if (removing) {
      // Nothing moves while it is off the x-ray: the pouch stays drawn where it is, in red, and both views show the mix as it is.
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
      // A click: the element's onClick selects — except a finger on a pouch,
      // whose click the touchstart guard below suppresses; the tap acts here.
      if (!canceled && e.pointerType === "touch") onTap?.();
      return;
    }
    draggingRef.current = false;
    justDraggedRef.current = !canceled; // the click that follows the drop must not re-select the old ref
    if (d.removing && !canceled) {
      takeOut(d.source);
      return;
    }
    const plan = planDrop(d, canceled ? null : d.over, canceled);
    if (plan.kind === "refused") {
      toast.error(plan.error); // cap feedback, the add's path
      return;
    }
    if (plan.kind === "move") commitMove(placements, plan.placements, d.source, plan.ref, plan.within);
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
      changeDive(ref.section);
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

  const cancelDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    draggingRef.current = false;
    setDrag(null);
    draftSignature.current = "";
    setOwnDraft(null);
    clearXrayDraft(placementsRef.current, "top");
  }, []);
  // Where the held pouch stands in its own preview, drawn: its badge sits over it, and a snap holds it there.
  // With no preview (it has nowhere to go from here), where it already stands: the badge still says so.
  const heldKey = ownDraft?.key ?? (drag?.active ? drag.key : null);
  const heldDrawn = useMemo(() => {
    if (!heldKey) return null;
    const p = (ownDraft ? shownPieces : pieces).find((q) => q.key === heldKey);
    if (!p) return null;
    const r = p.section === dived ? p : p.settled;
    const s = (ownDraft?.fit ?? fit).settle.pieces.find((q) => q.key === heldKey);
    // Across, mm from where it sits un-nudged at this Size (stored as M millimetres): the badge's other axis.
    const placed = (ownDraft?.placements ?? placements).find((q) => `${q.section}/${q.subSection}/${q.slot}` === heldKey);
    const acrossMm = (placed?.offsetXMm ?? 0) * sizeFactors(PILLOW_DIMENSIONS[pillowSize]).across;
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, top: r.y, startMm: s?.startMm ?? null, endMm: s?.endMm ?? null, acrossMm, section: p.section };
  }, [heldKey, ownDraft, shownPieces, pieces, fit, dived, placements, pillowSize]);
  // What the badge over the held pouch says: where it lands front ↔ back (and the snap), and across.
  const heldBadge =
    heldDrawn && heldDrawn.startMm !== null && heldDrawn.endMm !== null
      ? [landingText(heldDrawn.startMm, heldDrawn.endMm, ownDraft ? draftSnap : null), acrossText(heldDrawn.acrossMm)].filter(Boolean).join(" · ")
      : null;
  // A snap's line, as the cut draws one: across the held pouch's Section at the edge or middle it lined it up with.
  const snapGuide = (() => {
    if (!ownDraft || !draftSnap || !heldDrawn || heldDrawn.startMm === null || heldDrawn.endMm === null) return null;
    const mm = draftSnap === "front edge" ? heldDrawn.startMm : draftSnap === "back edge" ? heldDrawn.endMm : (heldDrawn.startMm + heldDrawn.endMm) / 2;
    const col = SECTIONS.indexOf(heldDrawn.section);
    return { y: stage.rowY[0] + mm * stage.k, x0: stage.colX[col], x1: stage.colX[col + 1] };
  })();
  useEffect(() => {
    snapHeld.current = draftSnap && ownDraft && heldDrawn ? [heldDrawn.cx, heldDrawn.cy] : null;
  }, [draftSnap, ownDraft, heldDrawn]);
  /**
   * Where the selected pouch's bin sits, frame %: its drawn top-right, a little in so it sits on the pouch, kept
   * inside the frame. Only in its own dive, and not while anything is held or the add picker is open.
   */
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
  /** The pouch drawn red as the one coming out: carried off the x-ray, or its bin under the pointer. */
  const removingKey = drag?.active && drag.removing ? drag.key : binAt && binHover !== null && binHover === selectedKey ? binHover : null;
  // A snap taking hold is felt as well as seen, where the device can (a phone's short buzz), whatever holds it.
  useEffect(() => {
    if (draftSnap && dragRef.current) buzz();
  }, [draftSnap]);
  // A committed recipe (or this view leaving the page) ends any preview this view published.
  useEffect(() => () => clearXrayDraft(placementsRef.current, "top"), []);
  useEffect(() => {
    if (!dragRef.current) {
      draftSignature.current = "";
      setOwnDraft(null);
    }
  }, [placements]);
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
      // Delete (or a Mac's Backspace) takes the selected pouch out, as its bin does.
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

  // Side-by-side chip: collated type label (×count) + remove, floated over the
  // pouch group at its centroid. Stacked cells use the external labels instead.
  const pieceChip = (cell: Cell, itemId: number, slots: number[]) => {
    const label = pieceLabel(itemId);
    const lastSlot = slots[slots.length - 1];
    const on = selectedPiece?.subSection === cell.subSection && slots.includes(selectedPiece.slot);
    // The chip sits on its pouches, so it picks one of them up: the selected one, else the first.
    const ref: PieceRef = { section: cell.section, subSection: cell.subSection, slot: on ? selectedPiece!.slot : slots[0] };
    return (
      <span className={`flex items-center gap-0.5 px-1 md:dock:pl-2 md:dock:pr-0.5 ${CHIP_CLASS} ${on ? "ring-1 ring-sky-400" : ""}`}>
        {/* The chip sits on the pouch, so its label is the selection target there (slice 06). */}
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
            : "flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent aria-disabled:opacity-40 md:dock:text-sm"
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
      className={`pointer-events-auto flex items-center gap-0.5 px-1 hover:bg-accent max-md:min-h-7 max-md:px-2 md:dock:min-h-9 md:dock:gap-1.5 md:dock:px-3 ${CHIP_CLASS}`}
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
        {/* Its own element, not a sibling of the header: `first:border-t-0`
            below only reaches the first cell when the cells are the first
            children of their container. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panels.map(({ subSection, cell, cellPcs, stacked, layers }) => {
          const full = cellIsFull(subSection);
          return (
            <div
              key={subSection}
              className="flex flex-col gap-1.5 border-t border-border/60 px-1 py-2 first:border-t-0 md:dock:gap-2 md:dock:py-3"
            >
              {/* Wraps rather than squeezing: a narrow host panel puts Add filling on its own line instead of
                  clipping the Side / Stacked toggle. */}
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
              {/* Phone parity (slice 04): the same fit note as on the desktop panel. */}
              {cellPcs.length > 0 && cellFitOf(subSection) && (
                <CellFitNote cell={cellFitOf(subSection)!} size={pillowSize} className="text-[11px] md:dock:text-sm" />
              )}
              {/* Slotted (desktop), a one-layer cell's Add layer joins its chips' line: the slot is only as tall
                  as the pillow, and a line per button pushed the third cell out of sight. */}
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
                    const d = (authored ? authoredPaths.get(p.key) : settledPaths.get(p.key))!;
                    const squeeze = pieceStatuses.get(p.key) ?? RELAXED_PIECE;
                    return (
                      // True size: a pouch overhangs its own cell where it is longer than it, so no cell clip.
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
            {/* Linked views: the pouch in hand — here or on the cut — picked out where it would land. */}
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

            {/* Drag feedback (slice 07): the hovered drop cell highlights in the
                selection blue — red when the drop would leave the cell overfull —
                and a ghost of the pouch's outline follows the pointer. (Blue, not
                the add-target white: white is invisible on the unveiled Section.) */}
            {drag?.active && drag.over && (
              <path
                d={stage.cellClipPaths[`${drag.over.section}/${drag.over.subSection}`]}
                fill={drag.overfull ? AMBER : "#38bdf8"}
                fillOpacity={drag.overfull ? 0.25 : 0.18}
                data-xray-drop-hover={drag.overfull ? "overfull" : "ok"}
              />
            )}

            {/* Front-layer labels, at the settled centroid unless the Section is
                dived. A dived Section on a desktop already names its pieces
                with the chips sitting on them, so it drops these — unless the
                chips are slotted beside the pillow, when nothing else would. */}
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
            {/* Remove (15-11-2026): the pouch a release or its bin would take out, red where it stands — over the
                dive's veil, so one carried off from another Section reads red too. */}
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
                      changeDive(section);
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
              (hitPiecesBySection.get(section) ?? []).map((p) => {
                const inDive = section === dived;
                // The committed pieces, so a held pouch keeps its element (and its pointer capture) while a preview
                // moves it; one the preview has moved away takes its committed outline (conformed already, cached).
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
          {/* The held pouch under the pointer, over everything, and the badge over it saying where it lands: the side
              view's (held-pouch.tsx), so the two views hold a filling alike. The pouch itself already stands where it
              would land (the live preview), drawn solid; the ghost parts from it where a wall or a neighbour stops it. */}
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

          {/* The selected pouch's bin (15-11-2026): on its top-right corner, so Staff take out the piece they are
              looking at without finding it in a list. Hovered, the pouch turns red, as one carried off does. */}
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
                  {/* Fit note (slice 04): compressed / over, on the cell, only when it is one. */}
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
              trigger so the wedges are thumb-sized.
              Slotted (desktop, controls beside the pillow): nothing else sits
              on the art, so the bloom grows past the dive column to a fixed
              300px with phone-sized labels. It is portalled to the page, so
              it can spill over the neighbouring columns without being clipped. */}
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

      {/* Phones have no hover cue that the sections are tappable: say so, in the
          gap under the pillow, until a section is dived. */}
      {editable && isMobile && !dived && (
        <p
          className="pointer-events-none absolute inset-x-0 top-full text-center text-[11px] leading-4 text-white/70"
          aria-hidden
        >
          Tap a section to edit · drag a pouch to move it, slowly to place it exactly, or off the x-ray to remove it
        </p>
      )}

      {/* Carried off the x-ray (15-11-2026): the frame rings red, and a chip by the hand says what its release does —
          the frame clips the ghost on a desktop, so off it the chip is what follows the pointer. Portalled to the
          page: a dialog's transform would otherwise hold a fixed element inside it. */}
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
      {/* Host-provided slot (desktop): the same controls beside the pillow, off the art. A flex column all the
          way down, so in a slot of bounded height the header (Mirror, Done) stays put while the cells scroll. */}
      {dived && editable && slotted && createPortal(<div data-xray-dive-dock className="flex min-h-0 flex-1 flex-col">{diveControls("min-h-0 flex-1")}</div>, controlsSlot!)}
    </div>
  );
}
