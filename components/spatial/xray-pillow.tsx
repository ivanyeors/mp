"use client";

/**
 * X-ray filling renderer + dive editor (slices 07/08). ADR 0009 guardrails:
 * nested clipping (silhouette ∩ cell) — never box crops; deterministic layout
 * via layoutPlacements; pieces keep distinct outlines; colors via per-subtype
 * CSS variables; all paths come from the one asset pipeline (xray-assets);
 * shape swaps use PREPARED flubber morphs (crossfade on degenerate pairs) and
 * animations touch only `transform` / path `d` / paint opacity — no layout.
 * Staff-only: callers mount this behind the staff assist gate.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FlipHorizontal2, GripVertical, Layers, Plus, Trash2, X } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

import { SunburstMenu } from "@/components/ui/sunburst-menu";
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
  removeLayer,
  removePiece,
  setCellArrangement,
  type Cell,
} from "@/lib/configurator/staff-assist";
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
  makeRegion,
  type ConformRegion,
} from "@/lib/spatial-fillings/conform";
import { getShapeMorph } from "@/lib/spatial-fillings/morphs";
import { fillingVisual, sizeScale, type FillingVisual } from "@/lib/spatial-fillings/visuals";
import { COL_X, GAP, layoutPlacements, ROW_Y, type PieceRect } from "@/lib/spatial-fillings/xray-layout";
import {
  CELL_CLIP_PATHS,
  CELL_POLYGONS,
  FILLING_SHAPE_PATHS,
  SECTION_HIT_PATHS,
  SHELL_SEAM,
  SILHOUETTE_PATH,
  SILHOUETTE_POLYGON,
  XRAY_VIEW,
  type CellKey,
} from "./xray-assets";

// Shell regions pouches deform against: the silhouette (wide seam) and each
// cell's wavy boundary (thin seam, matching the pouch-to-pouch gap).
const SIL_REGION = makeRegion(SILHOUETTE_POLYGON, SHELL_SEAM);
const CELL_REGIONS = Object.fromEntries(
  (Object.entries(CELL_POLYGONS) as Array<[CellKey, typeof SILHOUETTE_POLYGON]>).map(
    ([key, poly]) => [key, makeRegion(poly, GAP)],
  ),
) as Record<CellKey, ConformRegion>;

/** item id → pouch render scale, from each Item's size. */
export function itemScaleMap(itemSizes: ReadonlyMap<number, string | null>): Map<number, number> {
  return new Map([...itemSizes].map(([id, size]) => [id, sizeScale(size)]));
}

// useLayoutEffect starts morphs before paint (no first-frame flash); SSR no-ops.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MORPH_MS = 320;

// Shell paint, themeable: the configurator's stage is dark in both themes, so
// the defaults are the dark values; XrayEditor's frame redefines the variables
// for light mode (and back for dark).
export const XRAY_SHELL = "var(--xray-shell, rgba(255,255,255,0.9))";
export const XRAY_INTERIOR = "var(--xray-interior, rgba(15,23,42,0.5))";
const XRAY_VEIL = "var(--xray-veil, rgb(2,6,23))";

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
 */
export function MorphPiece({
  subtype,
  visual,
  d,
}: {
  subtype: string | null;
  visual: FillingVisual;
  d: string;
}) {
  const shape = visual.shape;
  const ref = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  const prevShape = useRef(shape);
  const [ghost, setGhost] = useState<typeof shape | null>(null);

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

  const paint = {
    "data-item-subtype": subtype ?? "",
    fill: `var(${visual.cssVar}, ${visual.defaultColor})`,
    fillOpacity: 0.9,
    stroke: "rgba(255,255,255,0.9)",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke",
  } as const;

  return (
    <>
      {ghost && <path ref={ghostRef} d={d} {...paint} />}
      <path ref={ref} d={d} {...paint} />
    </>
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
  pieces,
  full,
  onAdd,
  onRemoveLayer,
  onRemovePiece,
}: {
  id: string;
  index: number;
  depth: number;
  pieces: Array<{ slot: number; label: string }>;
  full: boolean;
  onAdd: () => void;
  onRemoveLayer: () => void;
  onRemovePiece: (slot: number) => void;
}) {
  const { ref, isDragging, handleRef } = useSortable<HTMLDivElement>({ id, index });
  return (
    <div
      ref={ref}
      className={`pointer-events-auto flex items-center gap-1 px-1 max-md:gap-1.5 max-md:px-1.5 ${LAYER_ROW_CLASS} ${isDragging ? "z-50 opacity-70 shadow-lg" : ""}`}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">{depth + 1}</span>
      {/* Wraps rather than overflows: five pieces per layer at a readable size
          cannot sit on one line inside a cell (or a 360px dock). */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {pieces.map((piece) => (
          <span key={piece.slot} className="flex items-center gap-0.5 rounded bg-muted pl-1.5">
            <span className="max-w-16 truncate max-md:max-w-28">{piece.label}</span>
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
  items,
  onPlacementsChange,
  className,
}: {
  placements: PillowPlacement[];
  /** item id → subtype (resolves fluid shape + color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size (scales the pouch); absent ids render at 1. */
  itemSizes?: ReadonlyMap<number, string | null>;
  /** Inventory filling Items for the dive editor picker; read-only when omitted. */
  items?: FillingItem[];
  /** Same lifted session-mix state the list editor writes (never forked). */
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  className?: string;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
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
  const editable = Boolean(items && onPlacementsChange);
  // Phones: a cell is ~65px tall on a 360px stage, so controls parked ON the
  // cells collide with their neighbours at any font size. Below md the dive
  // keeps the on-pillow cell highlight + tap-to-add, and the chips, toggle,
  // layer rows and add-layer move into a dock right under the pillow.
  const isMobile = useIsMobile();
  // Ring 1 = filling family (3D/6D/6D+), leaves = deduped inventory items.
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);

  // Leaving the dive takes the open picker and the cell hover with it — the
  // cell hit areas unmount, so no mouseleave would ever fire to clear them.
  const endDive = useCallback(() => {
    setDived(null);
    setOpenSub(null);
    setOpenLayer(null);
    setHoverSub(null);
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
      if (e.key === "Escape") endDive();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) endDive();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [dived, endDive]);

  // layoutPlacements + conformPouchPath are pure and deterministic, so the whole
  // geometry chain memoises on (placements, itemSizes): a hover/dive re-render
  // no longer re-runs the pouch conform (polygon scans) for every piece.
  const pieces = useMemo(
    () => layoutPlacements(placements, itemSizes ? itemScaleMap(itemSizes) : undefined),
    [placements, itemSizes],
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
  /** piece key → conformed pouch outline, computed once per geometry change. */
  const conformedPaths = useMemo(() => {
    const paths = new Map<string, string>();
    for (const [key, cellPieceList] of piecesByCell) {
      const regions = [SIL_REGION, CELL_REGIONS[key]];
      for (const p of cellPieceList) {
        const shape = fillingVisual(itemSubtypes.get(p.itemId) ?? null).shape;
        paths.set(p.key, conformPouchPath(p, regions, 2, shape));
      }
    }
    return paths;
  }, [piecesByCell, itemSubtypes]);
  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  // Dive keeps the x-ray fixed over the shell (no pan/zoom): neighbors dim and
  // the editor overlay aligns to the dived column in place.
  const divedIdx = dived ? SECTIONS.indexOf(dived) : -1;

  const addToCell = (cell: Cell, itemId: number, layer: number | null) => {
    const result = addPiece(placements, cell, itemId, layer);
    if (!result.ok) {
      toast.error(result.error); // cap / rule feedback, visible on-canvas
      return;
    }
    onPlacementsChange?.(result.placements);
  };

  const pieceLabel = (itemId: number) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? fillingLabel(item) : `Item #${itemId}`;
  };

  // Side-by-side chip: collated type label (×count) + remove, floated over the
  // pouch group at its centroid. Stacked cells use the external labels instead.
  const pieceChip = (cell: Cell, itemId: number, slots: number[]) => {
    const label = pieceLabel(itemId);
    const lastSlot = slots[slots.length - 1];
    return (
      <span className={`flex items-center gap-0.5 px-1 ${CHIP_CLASS}`}>
        <span className="max-w-24 truncate">
          {label}
          {slots.length > 1 ? ` ×${slots.length}` : ""}
        </span>
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
      left: `${(((COL_X[divedIdx] + COL_X[divedIdx + 1]) / 2) / XRAY_VIEW.width) * 100}%`,
      top: `${(((ROW_Y[b] + ROW_Y[b + 1]) / 2) / XRAY_VIEW.height) * 100}%`,
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
        disabled={empty}
        className={
          compact
            ? `pointer-events-auto flex items-center gap-0.5 px-1 hover:bg-accent disabled:opacity-40 ${CHIP_CLASS}`
            : "flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
        }
        aria-label={
          empty
            ? `Nothing in the ${section} section to mirror`
            : `Mirror the ${section} section onto the ${to} section, replacing it`
        }
        onClick={() => {
          const before = placements;
          const next = mirrorSection(before, section);
          if (next === before) return;
          onPlacementsChange?.(next);
          toast.success(`Mirrored ${section} onto ${to}`, {
            action: { label: "Undo", onClick: () => onPlacementsChange?.(before) },
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
      className={`pointer-events-auto flex items-center gap-0.5 px-1 hover:bg-accent max-md:min-h-7 max-md:px-2 ${CHIP_CLASS}`}
      aria-label={`Add a layer under ${cell.section} ${subSection}`}
      onClick={() => openPicker(subSection, layers.length)}
    >
      <Layers className={CHIP_ICON_CLASS} />
      Add layer
    </button>
  );

  const rectByKey = new Map(pieces.map((pl) => [pl.key, pl] as const));

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
      const move = layerDragDestination(layers, event);
      if (!move) return;
      const { from, to } = move;
      onPlacementsChange?.(moveLayer(placements, cell, from, to));
    };

  return (
    <div ref={rootRef} className={className} style={{ pointerEvents: "none" }}>
      <svg
        viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-label="X-ray filling view"
      >
        <defs>
          <clipPath id={clipId("sil")}>
            <path d={SILHOUETTE_PATH} />
          </clipPath>
          {cellsInUse.map((key) => (
            <clipPath key={key} id={clipId(key)}>
              <path d={CELL_CLIP_PATHS[key]} />
            </clipPath>
          ))}
        </defs>

        <g>
          {/* x-ray art direction: shell interior darkens so fillings read inside */}
          <g clipPath={`url(#${clipId("sil")})`}>
            <path d={SILHOUETTE_PATH} fill={XRAY_INTERIOR} />

            {/* nested clipping: silhouette ∩ cell — belt only; the pouch
                geometry itself deforms to stay a seam inside both regions.
                Stacked layers paint deepest-first with a depth scrim (deeper =
                darker) so the overlap reads as a front-to-back stack. */}
            {cellsInUse.map((key) => (
              <g key={key} clipPath={`url(#${clipId(key)})`}>
                {(piecesByCell.get(key) ?? []).map((p) => {
                  const subtype = itemSubtypes.get(p.itemId) ?? null;
                  const visual = fillingVisual(subtype);
                  const d = conformedPaths.get(p.key)!;
                  return (
                    <g key={p.key}>
                      <MorphPiece key={visual.shape} subtype={subtype} visual={visual} d={d} />
                      {p.depth > 0 && (
                        <path d={d} fill="rgb(2,6,23)" fillOpacity={Math.min(0.14 * p.depth, 0.5)} />
                      )}
                    </g>
                  );
                })}
              </g>
            ))}

            {/* Front-layer labels. A dived Section on a desktop already names its
                pieces with the chips sitting on them, so it drops these. */}
            {pieces.map((p) =>
              p.depth === 0 && !(editable && !isMobile && p.section === dived) ? (
                <PieceLabel
                  key={`label-${p.key}`}
                  rect={p}
                  lines={pieceLabelLines(itemSubtypes.get(p.itemId) ?? null, itemSizes?.get(p.itemId) ?? null)}
                />
              ) : null,
            )}

            {hovered && hovered !== dived && (
              <path d={SECTION_HIT_PATHS[hovered]} fill="white" fillOpacity={0.15} />
            )}

            {/* Dive focus: neighbor Sections dim (static veil, silhouette-clipped) */}
            {dived &&
              SECTIONS.filter((s) => s !== dived).map((s) => (
                <path key={s} d={SECTION_HIT_PATHS[s]} fill={XRAY_VEIL} fillOpacity={0.55} />
              ))}

            {/* The add target is a whole cell, and its highlight IS the cell
                region — clipped to the silhouette, so the affordance can never
                sit outside the shell the way a floating + button did. */}
            {dived && editable && addTarget && (
              <path
                d={CELL_CLIP_PATHS[`${dived}/${addTarget}`]}
                fill="white"
                fillOpacity={cellIsFull(addTarget) ? 0.05 : 0.14}
              />
            )}
          </g>

          <path
            d={SILHOUETTE_PATH}
            fill="none"
            stroke={XRAY_SHELL}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />

          {/* Section hit areas: hover highlight; click dives (or switches Sections) */}
          {SECTIONS.map((section) => (
            <path
              key={section}
              d={SECTION_HIT_PATHS[section]}
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
                  d={CELL_CLIP_PATHS[`${dived}/${subSection}`]}
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
        </g>
      </svg>

      {/* Dive editor overlay: every control sits ON the cell it edits, so no
          leader lines and nothing to clip. (view coords → HTML %, linear map) */}
      {dived && editable && (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} data-xray-dive>
          {/* Section-level chrome, above the dived column's top cell. The cell
              panels are centred at 16.7% (the front cell's mid-line), so this
              band clears them; inside the frame, so it is never the clipped
              gutter the per-cell controls had to move out of. */}
          {!isMobile && (
            <div
              className="absolute z-30 flex -translate-x-1/2 justify-center"
              style={{
                left: `${(((COL_X[divedIdx] + COL_X[divedIdx + 1]) / 2) / XRAY_VIEW.width) * 100}%`,
                top: "1.5%",
                pointerEvents: "none",
              }}
              data-xray-dive-section-bar
            >
              {mirrorButton(dived, true)}
            </div>
          )}

          {/* Side-by-side cells: centroid chips over their pouch group. */}
          {!isMobile && sideChips.map((fc) => (
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
              return (
                <div
                  key={subSection}
                  className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                  style={{ ...cellCenter(subSection), pointerEvents: "none" }}
                >
                  {/* ponytail: a side cell's centroid chips share this band; the
                      panel's opaque background and z-20 keep the toggle
                      readable. Tighten the chips to max-w-16 if it ever bites. */}
                  {cellPcs.length >= 2 && arrangementToggle(cell, subSection, stacked)}
                  {/* One layer needs no row of its own — its pieces are the
                      centroid chips on the pouches. Rows appear from two up.
                      One provider per CELL: see layerDragEnd. */}
                  {stacked && (
                    <DragDropProvider onDragEnd={layerDragEnd(cell, layers)}>
                      {layers.map((layer, depth) => (
                        <LayerRow
                          key={layerSortableId(layer)}
                          id={layerSortableId(layer)}
                          index={depth}
                          depth={depth}
                          full={layer.length >= MAX_PIECES_PER_LAYER}
                          pieces={layer.map((p) => ({ slot: p.slot, label: pieceLabel(p.itemId) }))}
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
                  : `${((COL_X[divedIdx + 1] - COL_X[divedIdx]) / XRAY_VIEW.width) * 100}%`,
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

      {/* Phones have no hover cue that the sections are tappable: say so, in the
          gap under the pillow, until a section is dived. */}
      {editable && isMobile && !dived && (
        <p
          className="pointer-events-none absolute inset-x-0 top-full text-center text-[11px] leading-4 text-white/70"
          aria-hidden
        >
          Tap a section to edit its fillings
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
          <div className="flex max-h-[70vh] flex-col rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-xl">
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
                    <DragDropProvider onDragEnd={layerDragEnd(cell, layers)}>
                      {layers.map((layer, depth) => (
                        <LayerRow
                          key={layerSortableId(layer)}
                          id={layerSortableId(layer)}
                          index={depth}
                          depth={depth}
                          full={layer.length >= MAX_PIECES_PER_LAYER}
                          pieces={layer.map((p) => ({ slot: p.slot, label: pieceLabel(p.itemId) }))}
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
        </div>
      )}
    </div>
  );
}
