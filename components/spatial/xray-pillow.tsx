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

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { GripVertical, Plus, X } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

import { SunburstMenu } from "@/components/ui/sunburst-menu";
import { fillingItemsToSunburst, fillingLabel } from "@/lib/spatial-fillings/filling-groups";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import {
  addPiece,
  cellArrangement,
  cellPieces,
  cellStack,
  removePiece,
  setCellArrangement,
  setDepthOrder,
  type Cell,
} from "@/lib/configurator/staff-assist";
import {
  MAX_PIECES_PER_CELL,
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
import { COL_X, GAP, layoutPlacements, ROW_Y } from "@/lib/spatial-fillings/xray-layout";
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
const easeOut = (t: number) => t * (2 - t);

/**
 * One filling piece; `d` is its conform-deformed outline in view coordinates
 * (see conform.ts), so its border follows the shell curve with no sharp cut
 * corners. When its shape swaps (item type change in the same slot), the
 * prepared flubber interpolator animates path `d`; degenerate pairs crossfade
 * an old-shape ghost instead — attribute writes only, no re-layout.
 * ponytail: swap morphs interpolate the normalized asset shapes, not the
 * conformed outline — rebase them through conformPouchPath when a second
 * ShapeId exists; today there is only the pouch, so no swap ever runs.
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

function assignRef<T>(ref: unknown, el: T | null) {
  if (typeof ref === "function") (ref as (el: T | null) => void)(el);
  else if (ref && typeof ref === "object") (ref as { current: T | null }).current = el;
}

/**
 * One external stack label (staff dive, stacked cells): draggable to reorder the
 * cell's depth (top→deep). `register` reports the DOM node so the parent can
 * anchor the bezier leader-line; the sortable id is the piece key `sec/sub/slot`.
 */
function StackLabel({
  id,
  index,
  label,
  onRemove,
  register,
}: {
  id: string;
  index: number;
  label: string;
  onRemove: () => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const { ref, isDragging, handleRef } = useSortable({ id, index });
  return (
    <div
      ref={(el) => {
        assignRef(ref, el);
        register(id, el);
      }}
      className={`pointer-events-auto flex items-center gap-0.5 rounded border bg-background/90 px-1 text-[9px] leading-4 shadow-sm ${isDragging ? "opacity-70 shadow-lg" : ""}`}
    >
      <button
        ref={handleRef}
        type="button"
        className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Drag ${label} to reorder depth`}
      >
        <GripVertical className="size-2.5" />
      </button>
      <span className="max-w-24 truncate">{label}</span>
      <button
        type="button"
        className="shrink-0 rounded hover:bg-destructive/20"
        aria-label={`Remove one ${label}`}
        onClick={onRemove}
      >
        <X className="size-2.5" />
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
  // Which sub-section's Add-filling menu is blooming — the others hide while it is.
  const [openSub, setOpenSub] = useState<string | null>(null);
  const editable = Boolean(items && onPlacementsChange);
  // Ring 1 = filling family (3D/6D/6D+), leaves = deduped inventory items.
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);

  // Exit the dive on Escape or a click anywhere outside the pillow — no CTA needed.
  useEffect(() => {
    if (!dived) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDived(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setDived(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [dived]);

  const pieces = layoutPlacements(placements, itemSizes ? itemScaleMap(itemSizes) : undefined);
  const cellsInUse = [...new Set(pieces.map((p) => `${p.section}/${p.subSection}` as CellKey))];
  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  // Dive keeps the x-ray fixed over the shell (no pan/zoom): neighbors dim and
  // the editor overlay aligns to the dived column in place.
  const divedIdx = dived ? SECTIONS.indexOf(dived) : -1;

  const addToCell = (cell: Cell, itemId: number) => {
    const result = addPiece(placements, cell, itemId);
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
      <span className="flex items-center gap-0.5 rounded border bg-background/90 px-1 text-[9px] leading-4 shadow-sm">
        <span className="max-w-24 truncate">
          {label}
          {slots.length > 1 ? ` ×${slots.length}` : ""}
        </span>
        <button
          type="button"
          className="shrink-0 rounded hover:bg-destructive/20"
          aria-label={`Remove one ${label} from ${cell.section} ${cell.subSection}`}
          onClick={() => onPlacementsChange?.(removePiece(placements, cell, lastSlot))}
        >
          <X className="size-2.5" />
        </button>
      </span>
    );
  };

  const rectByKey = new Map(pieces.map((pl) => [pl.key, pl] as const));
  // External control cluster aligns to the dived section's OWN side (left /
  // center / right) so its labels sit by the pouches they control.
  const externalSide: "left" | "center" | "right" =
    divedIdx === 0 ? "left" : divedIdx === 2 ? "right" : "center";

  // Side-by-side cells keep centroid chips (collated per type); stacked cells
  // move their per-piece labels outside the pillow (see clusters below).
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

  // Per-sub-section external cluster data for the dived section: toggle always
  // (2+ pieces), plus the ordered stack (top→deep) when the cell is stacked.
  const clusters =
    dived === null
      ? []
      : SUB_SECTIONS.map((subSection, b) => {
          const cell: Cell = { section: dived, subSection };
          const cellPcs = cellPieces(placements, cell);
          const stacked = cellPcs.length >= 2 && cellArrangement(placements, cell) === "stacked";
          return { subSection, b, cell, cellPcs, stacked, stack: stacked ? cellStack(placements, cell) : [] };
        });
  // Flat top→deep order across the dived section → stable sortable indices.
  const stackKeys = clusters.flatMap((c) =>
    c.stack.map((p) => `${c.cell.section}/${c.cell.subSection}/${p.slot}`),
  );

  // Measure each external label's inner edge (in view coords) so the bezier
  // leader-line lands exactly on it; re-run on layout / resize / edits.
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) labelRefs.current.set(id, el);
    else labelRefs.current.delete(id);
  }, []);
  const [anchors, setAnchors] = useState<Map<string, { x: number; y: number }>>(new Map());
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || dived === null) {
      setAnchors(new Map());
      return;
    }
    const compute = () => {
      const box = root.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const next = new Map<string, { x: number; y: number }>();
      for (const [key, el] of labelRefs.current) {
        const r = el.getBoundingClientRect();
        // Leader meets the label edge facing the pillow: side gutters → the inner
        // vertical edge; top gutter (center section) → the bottom edge.
        const px =
          externalSide === "center" ? r.left + r.width / 2 : externalSide === "right" ? r.left : r.right;
        const py = externalSide === "center" ? r.bottom : r.top + r.height / 2;
        next.set(key, {
          x: ((px - box.left) / box.width) * XRAY_VIEW.width,
          y: ((py - box.top) / box.height) * XRAY_VIEW.height,
        });
      }
      setAnchors(next);
    };
    compute();
    // Re-measure on the next frame (first-paint layout settle) and whenever a
    // label reflows — the justify-around column shifts every label's Y when one
    // changes height, so observe them all, not just the box.
    const raf = requestAnimationFrame(compute);
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    for (const el of labelRefs.current.values()) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dived, placements, externalSide]);

  // One cubic-bezier leader per stacked label, anchored on the layer's BORDER
  // facing the label (not a shared centroid). Deeper layers are offset
  // down-right, so the start points fan out and each line clearly points at its
  // own stacked layer.
  const connectors = clusters.flatMap((c) =>
    c.stack.flatMap((p) => {
      const key = `${c.cell.section}/${c.cell.subSection}/${p.slot}`;
      const r = rectByKey.get(key);
      const a = anchors.get(key);
      if (!r || !a) return [];
      if (externalSide === "center") {
        // Top gutter: start at the layer's top border, curve up to the label.
        const sx = r.x + r.w / 2;
        const sy = r.y;
        const dyc = (a.y - sy) * 0.5;
        return [{ key, d: `M ${sx} ${sy} C ${sx} ${sy + dyc} ${a.x} ${a.y - dyc} ${a.x} ${a.y}` }];
      }
      const sx = externalSide === "right" ? r.x + r.w : r.x;
      const sy = r.y + r.h / 2;
      const dxc = (a.x - sx) * 0.5;
      return [{ key, d: `M ${sx} ${sy} C ${sx + dxc} ${sy} ${a.x - dxc} ${a.y} ${a.x} ${a.y}` }];
    }),
  );

  // Drag a stacked label onto another → reorder that cell's depth (top→deep).
  const onStackDragEnd = (event: {
    operation?: { source?: { id?: string | number } | null; target?: { id?: string | number } | null };
  }) => {
    const src = event.operation?.source?.id;
    const tgt = event.operation?.target?.id;
    if (src == null || tgt == null || src === tgt) return;
    const srcKey = String(src);
    const tgtKey = String(tgt);
    const [ssec, ssub] = srcKey.split("/");
    const [tsec, tsub] = tgtKey.split("/");
    if (ssec !== tsec || ssub !== tsub) return; // depth reorders within one cell
    const cell: Cell = { section: ssec as Section, subSection: ssub as SubSection };
    const order = cellStack(placements, cell).map((p) => `${cell.section}/${cell.subSection}/${p.slot}`);
    const from = order.indexOf(srcKey);
    const to = order.indexOf(tgtKey);
    if (from < 0 || to < 0) return;
    const reordered = [...order];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onPlacementsChange?.(setDepthOrder(placements, cell, reordered.map((k) => Number(k.split("/")[2]))));
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
            <path d={SILHOUETTE_PATH} fill="rgba(15,23,42,0.5)" />

            {/* nested clipping: silhouette ∩ cell — belt only; the pouch
                geometry itself deforms to stay a seam inside both regions.
                Stacked layers paint deepest-first with a depth scrim (deeper =
                darker) so the overlap reads as a front-to-back stack. */}
            {cellsInUse.map((key) => (
              <g key={key} clipPath={`url(#${clipId(key)})`}>
                {pieces
                  .filter((p) => `${p.section}/${p.subSection}` === key)
                  .map((p) => {
                    const subtype = itemSubtypes.get(p.itemId) ?? null;
                    const d = conformPouchPath(p, [SIL_REGION, CELL_REGIONS[key]]);
                    return (
                      <g key={p.key}>
                        <MorphPiece subtype={subtype} visual={fillingVisual(subtype)} d={d} />
                        {p.depth > 0 && (
                          <path d={d} fill="rgb(2,6,23)" fillOpacity={Math.min(0.14 * p.depth, 0.5)} />
                        )}
                      </g>
                    );
                  })}
              </g>
            ))}

            {hovered && hovered !== dived && (
              <path d={SECTION_HIT_PATHS[hovered]} fill="white" fillOpacity={0.15} />
            )}

            {/* Dive focus: neighbor Sections dim (static veil, silhouette-clipped) */}
            {dived &&
              SECTIONS.filter((s) => s !== dived).map((s) => (
                <path key={s} d={SECTION_HIT_PATHS[s]} fill="rgb(2,6,23)" fillOpacity={0.55} />
              ))}
          </g>

          <path
            d={SILHOUETTE_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
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
              onClick={editable ? () => setDived(section) : undefined}
            />
          ))}
        </g>
      </svg>

      {/* Dive editor overlay: controls live OUTSIDE the pillow; stacked labels
          connect back to their pouch with a bezier leader-line. */}
      {dived && editable && (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} data-xray-dive>
          {/* Bezier leaders (view coords, linear map matches the HTML %). */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: "none", overflow: "visible" }}
            aria-hidden
          >
            {connectors.map((c) => (
              <path
                key={c.key}
                d={c.d}
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Side-by-side cells: centroid chips over their pouch group. */}
          {sideChips.map((fc) => (
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

          {/* External per-sub-section clusters: arrangement toggle + (stacked)
              the draggable top→deep label list, aligned to each ROW_Y band. */}
          <DragDropProvider onDragEnd={onStackDragEnd}>
            {clusters.map(({ subSection, b, cell, cellPcs, stacked, stack }) => {
              if (cellPcs.length < 2) return null;
              // Park the controls OUTSIDE the box in the section's dark margin:
              // left section → left gutter, right → right gutter, center → on top.
              const band = {
                top: `${(ROW_Y[b] / XRAY_VIEW.height) * 100}%`,
                height: `${((ROW_Y[b + 1] - ROW_Y[b]) / XRAY_VIEW.height) * 100}%`,
              };
              const pos: CSSProperties =
                externalSide === "center"
                  ? { bottom: "100%", left: `${b * (100 / 3)}%`, width: `${100 / 3}%`, marginBottom: 8 }
                  : externalSide === "right"
                    ? { ...band, left: "100%", width: "22%", marginLeft: 8 }
                    : { ...band, right: "100%", width: "22%", marginRight: 8 };
              const justify =
                externalSide === "center" ? "justify-center" : externalSide === "right" ? "justify-start" : "justify-end";
              const items =
                externalSide === "center" ? "items-center" : externalSide === "right" ? "items-start" : "items-end";
              return (
                <div
                  key={subSection}
                  className="absolute z-10 flex flex-col gap-1 p-1"
                  style={{ pointerEvents: "none", ...pos }}
                >
                  <div className={`flex ${justify}`} style={{ pointerEvents: "auto" }}>
                    <div
                      className="flex overflow-hidden rounded border text-[9px] leading-4"
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
                            className={`px-1.5 py-0.5 ${on ? "bg-primary text-primary-foreground" : "bg-background/85 hover:bg-accent"}`}
                            onClick={() => onPlacementsChange?.(setCellArrangement(placements, cell, mode))}
                          >
                            {mode === "side" ? "Side" : "Stacked"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {stacked && (
                    <div className={`flex min-h-0 flex-1 flex-col justify-around ${items}`}>
                      {stack.map((p) => {
                        const key = `${cell.section}/${cell.subSection}/${p.slot}`;
                        return (
                          <StackLabel
                            key={key}
                            id={key}
                            index={stackKeys.indexOf(key)}
                            label={pieceLabel(p.itemId)}
                            onRemove={() => onPlacementsChange?.(removePiece(placements, cell, p.slot))}
                            register={register}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </DragDropProvider>

          {/* Add-filling picker stays in the dived column footer. */}
          <div
            className="absolute inset-y-0 flex flex-col"
            style={{
              left: `${(COL_X[divedIdx] / XRAY_VIEW.width) * 100}%`,
              width: `${((COL_X[divedIdx + 1] - COL_X[divedIdx]) / XRAY_VIEW.width) * 100}%`,
            }}
          >
            {SUB_SECTIONS.map((subSection) => {
              const cell: Cell = { section: dived, subSection };
              const cellPcs = cellPieces(placements, cell);
              const full = cellPcs.length >= MAX_PIECES_PER_CELL;
              const otherOpen = openSub !== null && openSub !== subSection;
              return (
                <div
                  key={subSection}
                  className="flex flex-1 flex-col items-center justify-end gap-0.5 p-1"
                  style={{ pointerEvents: "auto" }}
                >
                  {full ? (
                    <span
                      className="rounded border bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      aria-label={`${dived} ${subSection} cell full`}
                    >
                      Cell full (max 5)
                    </span>
                  ) : otherOpen ? null : (
                    <SunburstMenu
                      root={fillingTree}
                      display="text"
                      size={220}
                      ringWidth={40}
                      holeRadius={18}
                      centerIcon={Plus}
                      ariaLabel={`Add filling to ${dived} ${subSection}`}
                      onOpenChange={(o) => setOpenSub(o ? subSection : null)}
                      onSelect={(leaf) => addToCell(cell, Number(leaf.id))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
