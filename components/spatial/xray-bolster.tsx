"use client";

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

const SHELL_REGIONS = {
  short: makeRegion(bolsterShellPolygon("short"), SHELL_SEAM),
  medium: makeRegion(bolsterShellPolygon("medium"), SHELL_SEAM),
  long: makeRegion(bolsterShellPolygon("long"), SHELL_SEAM),
} as const;

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
  dockOnPhone = false,
  className,
}: {
  placements: BolsterPlacement[];
  length: BolsterLength;
  itemSubtypes: ReadonlyMap<number, string | null>;
  itemSizes?: ReadonlyMap<number, string | null>;
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  fit?: BolsterFit;
  items?: FillingItem[];
  onPlacementsChange?: (next: BolsterPlacement[]) => void;
  controlsSlot?: HTMLElement | null;
  dockOnPhone?: boolean;
  className?: string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState(false);
  const [picking, setPicking] = useState(false);
  const editable = Boolean(items && onPlacementsChange);
  const isMobile = useIsMobile();
  const slotted = Boolean(controlsSlot) && (dockOnPhone || !isMobile);
  const wideDock = slotted && !isMobile;
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);
  const capsule = bolsterCapsulePath(length);
  const fit = useMemo(() => fitProp ?? fitBolster(placements, length, { dims: itemDims }), [fitProp, placements, length, itemDims]);
  const pieces = useMemo(() => layoutBolsterPlacements(placements, length, { dims: itemDims, fit }), [placements, length, itemDims, fit]);
  const fitOf = useMemo(() => new Map(fit.pieces.map((p) => [p.slot, p] as const)), [fit]);
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
    onPlacementsChange?.(addBolsterPiece(placements, itemId));
  };

  const ordered = [...placements].sort((a, b) => a.slot - b.slot);
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
            largeLabels={wideDock}
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
