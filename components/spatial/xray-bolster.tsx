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
 */

import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MorphPiece, PieceLabel, squeezeLines, XRAY_INTERIOR, XRAY_SHELL } from "./xray-pillow";
import { fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import { bolsterCapsulePath, SHELL_SEAM, XRAY_VIEW } from "./xray-assets";

// Pouches deform to stay a seam inside the capsule (see conform.ts).
const SHELL_REGIONS = {
  short: makeRegion(bolsterShellPolygon("short"), SHELL_SEAM),
  medium: makeRegion(bolsterShellPolygon("medium"), SHELL_SEAM),
  long: makeRegion(bolsterShellPolygon("long"), SHELL_SEAM),
} as const;

// The pillow's status paint (slice 04): amber at the limit, red when it cannot fit.
const RING_COMPRESSED = "#f59e0b";
const RING_OVER = "#ef4444";

/** The capsule gauge (slice 09): used / length mm, a bar, and the fit message when the pack is not ok. */
export function BolsterGauge({ fit, label }: { fit: BolsterFit; label: (itemId: number) => string }) {
  const pct = Math.min(fit.usedMm / Math.max(fit.lengthMm, 1), 1) * 100;
  const bar = fit.status === "over" ? "bg-red-500" : fit.status === "compressed" ? "bg-amber-500" : "bg-emerald-500";
  const tone = fit.status === "over" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div
      className="flex w-full max-w-sm flex-col gap-0.5 rounded border bg-background/90 px-1.5 py-0.5 text-[10px] leading-4 shadow-sm"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={fit.lengthMm}
      aria-valuenow={fit.usedMm}
      aria-label="Mbolster length used"
      data-xray-bolster-gauge={fit.status}
    >
      <div className="flex items-center gap-1 tabular-nums">
        <span>
          {Math.round(fit.usedMm)} / {Math.round(fit.lengthMm)} mm
        </span>
        {fit.status !== "ok" && <span className={`capitalize ${tone}`}>{fit.status}</span>}
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {fit.status !== "ok" && <div className="text-muted-foreground">{bolsterFitMessage(fit, label)}</div>}
    </div>
  );
}

export function XrayBolster({
  placements,
  length,
  itemSubtypes,
  itemSizes,
  itemDims,
  fit: fitProp,
  items,
  onPlacementsChange,
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
  className?: string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState(false);
  const editable = Boolean(items && onPlacementsChange);
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
    // Slice 09: the physical cap. A pack that could not fit even fully
    // squeezed is refused with the numbers; one that merely compresses is
    // allowed — the ring turns amber. Advisory, no slot count.
    const next = addBolsterPiece(placements, itemId);
    const would = fitBolster(next, length, { dims: itemDims });
    if (would.status === "over") {
      toast.error(bolsterFitMessage(would, pieceLabel));
      return;
    }
    onPlacementsChange?.(next);
  };

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
                {/* A pouch in a pack that cannot fit, or too thick for the bolster: red tint (slice 09). */}
                {squeeze.status === "over" && <path d={d} fill={RING_OVER} fillOpacity={0.3} />}
              </g>
            );
          })}
          {pieces.map((p) => (
            <PieceLabel
              key={`label-${p.key}`}
              rect={p}
              lines={[
                ...pieceLabelLines(itemSubtypes.get(p.itemId) ?? null, itemSizes?.get(p.itemId) ?? null),
                ...squeezeLines(squeezeOf(p.slot)),
              ]}
            />
          ))}
          {hovered && editable && <path d={capsule} fill="white" fillOpacity={0.15} />}
        </g>

        <path
          d={capsule}
          fill="none"
          stroke={XRAY_SHELL}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: "auto" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
        {/* Capsule status ring (slice 09): amber at the compression limit, red
            when the pack cannot fit — a stroke on the capsule path itself. */}
        {fit.status !== "ok" && (
          <path
            d={capsule}
            fill="none"
            stroke={fit.status === "over" ? RING_OVER : RING_COMPRESSED}
            strokeWidth={2.5}
            strokeOpacity={0.9}
            vectorEffect="non-scaling-stroke"
            data-xray-bolster-ring={fit.status}
          />
        )}
      </svg>

      {/* Single compartment — pieces edit inline, no dive step */}
      {editable && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-2"
          style={{ pointerEvents: "auto" }}
          data-xray-bolster-editor
        >
          {placements.length > 0 && <BolsterGauge fit={fit} label={pieceLabel} />}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-0.5">
            {[...placements]
              .sort((a, b) => a.slot - b.slot)
              .map((p) => (
                <button
                  key={p.slot}
                  type="button"
                  className="flex items-center gap-0.5 rounded border bg-background/85 px-1 text-[9px] leading-4 hover:bg-destructive/20"
                  aria-label={`Remove ${pieceLabel(p.itemId)} from bolster`}
                  onClick={() => onPlacementsChange?.(removeBolsterPiece(placements, p.slot))}
                >
                  <span className="max-w-24 truncate">{pieceLabel(p.itemId)}</span>
                  <X className="size-2.5 shrink-0" />
                </button>
              ))}
          </div>
          <Select value="" onValueChange={(v) => addItem(Number(v))}>
            <SelectTrigger
              size="sm"
              className="h-6 w-48 min-w-0 bg-background/85 text-[10px]"
              aria-label="Add filling to bolster"
            >
              <SelectValue placeholder="Add filling…" />
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
      )}
    </div>
  );
}
