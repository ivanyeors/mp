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

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import {
  addPiece,
  cellPieces,
  removePiece,
  type Cell,
} from "@/lib/configurator/staff-assist";
import {
  MAX_PIECES_PER_CELL,
  SECTIONS,
  SUB_SECTIONS,
  type PillowPlacement,
  type Section,
} from "@/lib/spatial-fillings/core";
import { getShapeMorph } from "@/lib/spatial-fillings/morphs";
import { fillingVisual, type FillingVisual } from "@/lib/spatial-fillings/visuals";
import { COL_X, layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import {
  CELL_CLIP_PATHS,
  FILLING_SHAPE_PATHS,
  SECTION_HIT_PATHS,
  SILHOUETTE_PATH,
  XRAY_VIEW,
  type CellKey,
} from "./xray-assets";

// useLayoutEffect starts morphs before paint (no first-frame flash); SSR no-ops.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MORPH_MS = 320;
const easeOut = (t: number) => t * (2 - t);

/**
 * One filling piece. When its shape swaps (item type change in the same slot),
 * the prepared flubber interpolator animates path `d`; degenerate pairs
 * crossfade an old-shape ghost instead — attribute writes only, no re-layout.
 */
function MorphPiece({
  subtype,
  visual,
  transform,
}: {
  subtype: string | null;
  visual: FillingVisual;
  transform: string;
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
    transform,
    fill: `var(${visual.cssVar}, ${visual.defaultColor})`,
    fillOpacity: 0.9,
    stroke: "rgba(255,255,255,0.9)",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke",
  } as const;

  return (
    <>
      {ghost && <path ref={ghostRef} d={FILLING_SHAPE_PATHS[ghost]} {...paint} />}
      <path ref={ref} d={FILLING_SHAPE_PATHS[shape]} {...paint} />
    </>
  );
}

export function XrayPillow({
  placements,
  itemSubtypes,
  items,
  onPlacementsChange,
  className,
}: {
  placements: PillowPlacement[];
  /** item id → subtype (resolves fluid shape + color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** Inventory filling Items for the dive editor picker; read-only when omitted. */
  items?: FillingItem[];
  /** Same lifted session-mix state the list editor writes (never forked). */
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  className?: string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState<Section | null>(null);
  const [dived, setDived] = useState<Section | null>(null);
  const editable = Boolean(items && onPlacementsChange);

  // Escape returns to the full view.
  useEffect(() => {
    if (!dived) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDived(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dived]);

  const pieces = layoutPlacements(placements);
  const cellsInUse = [...new Set(pieces.map((p) => `${p.section}/${p.subSection}` as CellKey))];
  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  // Dive = pan the dived Section's column to center (transform-only animation).
  // ponytail: scale stays 1 — Sections are full-height, so any zoom-in crops
  // sub-section cells; revisit if the designer export adds vertical margin.
  const divedIdx = dived ? SECTIONS.indexOf(dived) : -1;
  const diveX = dived ? XRAY_VIEW.width / 2 - (COL_X[divedIdx] + COL_X[divedIdx + 1]) / 2 : 0;

  const addToCell = (cell: Cell, itemId: number) => {
    const result = addPiece(placements, cell, itemId);
    if (!result.ok) {
      toast.error(result.error); // cap / rule feedback, visible on-canvas
      return;
    }
    onPlacementsChange?.(result.placements);
  };

  const itemLabel = (i: FillingItem) => (i.subtype ? `${i.name} (${i.subtype})` : i.name);
  const pieceLabel = (itemId: number) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? itemLabel(item) : `Item #${itemId}`;
  };

  return (
    <div className={className} style={{ pointerEvents: "none" }}>
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

        <motion.g animate={{ x: diveX }} transition={{ duration: 0.35, ease: "easeInOut" }}>
          {/* x-ray art direction: shell interior darkens so fillings read inside */}
          <g clipPath={`url(#${clipId("sil")})`}>
            <path d={SILHOUETTE_PATH} fill="rgba(15,23,42,0.5)" />

            {/* nested clipping: silhouette ∩ cell — pieces conform, never box-cropped */}
            {cellsInUse.map((key) => (
              <g key={key} clipPath={`url(#${clipId(key)})`}>
                {pieces
                  .filter((p) => `${p.section}/${p.subSection}` === key)
                  .map((p) => {
                    const subtype = itemSubtypes.get(p.itemId) ?? null;
                    const visual = fillingVisual(subtype);
                    const s = p.size / 100;
                    return (
                      <MorphPiece
                        key={p.key}
                        subtype={subtype}
                        visual={visual}
                        transform={`translate(${p.cx - 50 * s} ${p.cy - 50 * s}) scale(${s})`}
                      />
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
        </motion.g>
      </svg>

      {/* Dive editor overlay: three sub-section cells of the centered column */}
      {dived && editable && (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} data-xray-dive>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute left-1 top-1 h-6 px-2 text-xs"
            style={{ pointerEvents: "auto" }}
            onClick={() => setDived(null)}
          >
            ← Back (Esc)
          </Button>
          {/* Column is panned to center at scale 1, so the middle third + equal-third rows align with the cells */}
          <div className="absolute inset-y-0 left-1/3 flex w-1/3 flex-col">
            {SUB_SECTIONS.map((subSection) => {
              const cell: Cell = { section: dived, subSection };
              const cellPcs = cellPieces(placements, cell);
              const full = cellPcs.length >= MAX_PIECES_PER_CELL;
              return (
                <div
                  key={subSection}
                  className="flex flex-1 flex-col items-center justify-end gap-0.5 p-1"
                  style={{ pointerEvents: "auto" }}
                >
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    {cellPcs.map((p) => (
                      <button
                        key={p.slot}
                        type="button"
                        className="flex items-center gap-0.5 rounded border bg-background/85 px-1 text-[9px] leading-4 hover:bg-destructive/20"
                        aria-label={`Remove ${pieceLabel(p.itemId)} from ${dived} ${subSection}`}
                        onClick={() => onPlacementsChange?.(removePiece(placements, cell, p.slot))}
                      >
                        <span className="max-w-24 truncate">{pieceLabel(p.itemId)}</span>
                        <X className="size-2.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                  <Select value="" onValueChange={(v) => addToCell(cell, Number(v))}>
                    <SelectTrigger
                      size="sm"
                      className="h-6 w-full min-w-0 bg-background/85 text-[10px]"
                      disabled={full}
                      aria-label={`Add filling to ${dived} ${subSection}`}
                    >
                      <SelectValue placeholder={full ? "Cell full (max 5)" : "Add filling…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(items ?? []).map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {itemLabel(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
