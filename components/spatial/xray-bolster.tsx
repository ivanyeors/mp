"use client";

/**
 * Mbolster x-ray renderer + editor (slice 13 visual layer; true scale, fit
 * and feedback in X-ray pillow UX slice 09). One long compartment — no
 * Sections, no dive. Same ADR 0009 pipeline as the pillow x-ray: capsule
 * silhouette clipping (never box crops), deterministic layout, per-subtype
 * CSS-variable colors; pouches at their registry width × the length's scale,
 * settled into the capsule's empty ends and squeezed by the fit. The cap is
 * physical and derived (ADR 0008 amendment): the ring turns amber at the
 * compression limit, red when the pack cannot fit, and an add that would not
 * fit is refused with the numbers — never a slot count. Staff-only editing:
 * callers mount the picker behind the staff assist gate.
 *
 * The editor speaks the pillow dive editor's language: the same chips, the
 * same family → variant add picker (blooming over the capsule, which is also
 * its trigger), and a fit problem said in a word, never a used / length mm
 * bar. On a desktop a host can dock the controls off the art (`controlsSlot`,
 * an XraySectionDock), where they grow to the pillow dock's size.
 */

import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { SunburstMenu } from "@/components/ui/sunburst-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { addBolsterPiece, removeBolsterPiece } from "@/lib/configurator/staff-assist";
import type { BolsterPlacement } from "@/lib/spatial-fillings/core";
import { bolsterFitMessage, fitBolster, type BolsterFit, type FitStatus, type PieceFitStatus } from "@/lib/spatial-fillings/fit";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutBolsterPlacements, type BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import {
  bolsterShellPolygon,
  conformPouchPath,
  makeRegion,
} from "@/lib/spatial-fillings/conform";
import type { ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import {
  CHIP_CLASS,
  CHIP_ICON_BUTTON_CLASS,
  CHIP_ICON_CLASS,
  FitNote,
  MorphPiece,
  PieceLabel,
  SLOTTED_BLOOM_PX,
  XRAY_INTERIOR,
  XRAY_SHELL,
} from "./xray-pillow";
import { fillingItemsToSunburst, fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import { bolsterCapsulePath, SHELL_SEAM, XRAY_VIEW } from "./xray-assets";

// Pouches deform to stay a seam inside the capsule (see conform.ts).
const SHELL_REGIONS = {
  short: makeRegion(bolsterShellPolygon("short"), SHELL_SEAM),
  medium: makeRegion(bolsterShellPolygon("medium"), SHELL_SEAM),
  long: makeRegion(bolsterShellPolygon("long"), SHELL_SEAM),
} as const;

// The pillow's status paint (slice 04): amber at the limit and when it cannot fit — nothing turns red (Ivan, 1-11-2026).
const RING_COMPRESSED = "#f59e0b";

export function XrayBolster({
  placements,
  length,
  itemSubtypes,
  itemSizes,
  itemDims,
  fit: fitProp,
  items,
  onPlacementsChange,
  controlsSlot,
  className,
}: {
  placements: BolsterPlacement[];
  /** Drives the capsule silhouette length and the compartment frame. */
  length: BolsterLength;
  /** item id → subtype (resolves color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size, written in the piece's label. */
  itemSizes?: ReadonlyMap<number, string | null>;
  /** item id → registry dimensions: the pouch's width along the capsule and its thickness against the diameter. */
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  /** The host's fit (`useBolsterFit`), shared with its confirm and cross-section; computed here when omitted. */
  fit?: BolsterFit;
  /** Inventory filling Items for the editor picker; read-only when omitted. */
  items?: FillingItem[];
  /** Lifted session-mix state (never forked). */
  onPlacementsChange?: (next: BolsterPlacement[]) => void;
  /** Desktop: where the compartment controls render instead of over the capsule. */
  controlsSlot?: HTMLElement | null;
  className?: string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState(false);
  const [picking, setPicking] = useState(false);
  const editable = Boolean(items && onPlacementsChange);
  const isMobile = useIsMobile();
  const slotted = Boolean(controlsSlot) && !isMobile;
  // The pillow's add picker tree: family first, then only the variant ("S", "Fold S").
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);
  const capsule = bolsterCapsulePath(length);
  // The fit (slice 09) once per change; the layout draws its settled, squeezed widths.
  const fit = useMemo(() => fitProp ?? fitBolster(placements, length, { dims: itemDims }), [fitProp, placements, length, itemDims]);
  const pieces = useMemo(() => layoutBolsterPlacements(placements, length, { dims: itemDims, fit }), [placements, length, itemDims, fit]);
  const fitOf = useMemo(() => new Map(fit.pieces.map((p) => [p.slot, p] as const)), [fit]);
  /** A pouch's own squeeze: along the capsule (width ratio) and against the diameter (thickness). */
  const squeezeOf = (slot: number): PieceFitStatus => {
    const f = fitOf.get(slot);
    if (!f) return { status: "ok", widthRatio: 1, thicknessRatio: 1 };
    const thicknessRatio = f.thicknessStatus === "ok" ? 1 : Math.min(1, fit.diameterMm / Math.max(f.settledThicknessMm, 1));
    const status: FitStatus =
      fit.lengthStatus === "over" || f.thicknessStatus === "over"
        ? "over"
        : f.widthRatio < 1 - 1e-6 || f.thicknessStatus === "compressed"
          ? "compressed"
          : "ok";
    return { status, widthRatio: f.widthRatio, thicknessRatio };
  };

  // Same label as the pillow editor's chips, so one pouch reads the same on both surfaces.
  const itemLabel = (i: FillingItem) => fillingLabel(i);
  const pieceLabel = (itemId: number) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? itemLabel(item) : `Item #${itemId}`;
  };

  const addItem = (itemId: number) => {
    if (!Number.isFinite(itemId)) {
      toast.error("Unknown filling item");
      return;
    }
    // Fit never refuses: an overfull pack turns its ring amber and the fit note warns.
    onPlacementsChange?.(addBolsterPiece(placements, itemId));
  };

  const ordered = [...placements].sort((a, b) => a.slot - b.slot);
  // Said only when there is a problem (FitNote renders nothing for "ok"; the overlay's chip wrapper must not either).
  const fitNote = placements.length > 0 && fit.status !== "ok" && (
    <FitNote
      status={fit.status}
      message={bolsterFitMessage(fit, pieceLabel)}
      className="text-[11px] md:dock:text-sm"
      data-xray-bolster-fit={fit.status}
    />
  );
  const addButton = (
    <button
      type="button"
      className={`pointer-events-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap px-1 hover:bg-accent max-md:min-h-7 max-md:px-2 md:dock:min-h-9 md:dock:gap-1.5 md:dock:px-3 ${CHIP_CLASS}`}
      aria-label="Add filling to bolster"
      onClick={() => setPicking(true)}
    >
      <Plus className={CHIP_ICON_CLASS} />
      Add filling
    </button>
  );
  // One chip per pouch, in capsule order (end to end): the label, and a remove.
  const chips = ordered.map((p) => (
    <span
      key={p.slot}
      className={`pointer-events-auto flex items-center gap-0.5 px-1 md:dock:pl-2 md:dock:pr-0.5 ${CHIP_CLASS}`}
    >
      <span className="max-w-24 truncate md:dock:max-w-44">{pieceLabel(p.itemId)}</span>
      <button
        type="button"
        className={`${CHIP_ICON_BUTTON_CLASS} hover:bg-destructive/20`}
        aria-label={`Remove ${pieceLabel(p.itemId)} from bolster`}
        onClick={() => onPlacementsChange?.(removeBolsterPiece(placements, p.slot))}
      >
        <X className={CHIP_ICON_CLASS} />
      </button>
    </span>
  ));

  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      <svg
        viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-label="Mbolster x-ray filling view"
      >
        <defs>
          <clipPath id={`${uid}-capsule`}>
            <path d={capsule} />
          </clipPath>
        </defs>

        {/* x-ray art direction: shell interior darkens so fillings read inside.
            The capsule clip is belt only; pouch geometry deforms to stay a
            seam inside the shell. */}
        <g clipPath={`url(#${uid}-capsule)`}>
          <path d={capsule} fill={XRAY_INTERIOR} />
          {pieces.map((p) => {
            const subtype = itemSubtypes.get(p.itemId) ?? null;
            const visual = fillingVisual(subtype);
            const squeeze = squeezeOf(p.slot);
            const d = conformPouchPath(p, [SHELL_REGIONS[length]], visual.shape);
            return (
              <g key={p.key}>
                <MorphPiece
                  // Keyed by shape too: a pouch↔pill swap remounts (see MorphPiece).
                  key={`${p.key}-${visual.shape}`}
                  subtype={subtype}
                  visual={visual}
                  d={d}
                  status={squeeze.status}
                />
              </g>
            );
          })}
          {pieces.map((p) => (
            <PieceLabel
              key={`label-${p.key}`}
              rect={p}
              lines={pieceLabelLines(itemSubtypes.get(p.itemId) ?? null, itemSizes?.get(p.itemId) ?? null)}
            />
          ))}
          {(hovered || picking) && editable && <path d={capsule} fill="white" fillOpacity={0.15} />}
        </g>

        <path d={capsule} fill="none" stroke={XRAY_SHELL} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {/* The capsule is the add picker's trigger, as a pillow cell is: the picker blooms over it. */}
        {editable && (
          <path
            d={capsule}
            fill="transparent"
            className="cursor-pointer outline-none"
            style={{ pointerEvents: "auto" }}
            role="button"
            tabIndex={0}
            aria-label="Add filling to bolster"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => setPicking(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPicking(true);
              }
            }}
          />
        )}
        {/* Capsule status ring (slice 09): amber at the compression limit and
            when the pack cannot fit — a stroke on the capsule path itself. */}
        {fit.status !== "ok" && (
          <path
            d={capsule}
            fill="none"
            stroke={RING_COMPRESSED}
            strokeWidth={2.5}
            strokeOpacity={0.9}
            vectorEffect="non-scaling-stroke"
            data-xray-bolster-ring={fit.status}
          />
        )}
      </svg>

      {/* Single compartment — pieces edit inline, no dive step. Without a slot (phones, a narrow host)
          the controls sit in the frame under the capsule. */}
      {editable && !slotted && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-2"
          style={{ pointerEvents: "none" }}
          data-xray-bolster-editor
        >
          {chips.length > 0 && <div className="flex max-w-full flex-wrap items-center justify-center gap-1">{chips}</div>}
          <div className="flex items-center gap-2">
            {fitNote && <span className={`pointer-events-auto px-1 ${CHIP_CLASS}`}>{fitNote}</span>}
            {addButton}
          </div>
        </div>
      )}
      {/* Host-provided slot (desktop): the same controls beside the capsule, at the pillow dock's size. */}
      {editable &&
        slotted &&
        createPortal(
          <div data-xray-dive-dock data-xray-bolster-editor className="flex flex-col gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold md:dock:text-base">Compartment</span>
              {fitNote}
              <span className="ml-auto">{addButton}</span>
            </div>
            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Click the capsule or Add filling to add a pouch.</p>
            )}
          </div>,
          controlsSlot!,
        )}

      {/* Add-filling picker: blooms over the capsule's middle. Slotted, nothing else sits on the art, so it
          grows to the pillow's slotted size with phone-sized labels; phones size it to the frame. */}
      {editable && picking && (
        <div
          className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"
          style={{ width: isMobile ? "100%" : slotted ? SLOTTED_BLOOM_PX : 220, pointerEvents: "auto" }}
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
            ariaLabel="Add filling to bolster"
            onOpenChange={(o) => {
              if (!o) setPicking(false);
            }}
            onSelect={(leaf) => addItem(Number(leaf.id))}
          />
        </div>
      )}
    </div>
  );
}
