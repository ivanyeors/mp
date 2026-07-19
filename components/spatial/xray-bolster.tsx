"use client";

/**
 * Mbolster x-ray renderer + editor (slice 13 visual layer). One long
 * compartment — no Sections, no dive, no piece cap. Same ADR 0009 pipeline as
 * the pillow x-ray: capsule silhouette clipping (never box crops),
 * deterministic layout, per-subtype CSS-variable colors, pouch scale from the
 * Item's size. Staff-only: callers mount this behind the staff assist gate.
 */

import { useId, useState } from "react";
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
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutBolsterPlacements, type BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import { itemScaleMap, MorphPiece } from "./xray-pillow";
import { bolsterCapsulePath, SHELL_SEAM, XRAY_VIEW } from "./xray-assets";

export function XrayBolster({
  placements,
  length,
  itemSubtypes,
  itemSizes,
  items,
  onPlacementsChange,
  className,
}: {
  placements: BolsterPlacement[];
  /** Drives the capsule silhouette length and the compartment frame. */
  length: BolsterLength;
  /** item id → subtype (resolves color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size (scales the pouch); absent ids render at 1. */
  itemSizes?: ReadonlyMap<number, string | null>;
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
  // Pieces clip to the capsule inset by the seam; its curve is stroked per
  // pouch so borders conform to the rounded ends.
  const capsuleInner = bolsterCapsulePath(length, SHELL_SEAM);
  const pieces = layoutBolsterPlacements(
    placements,
    length,
    itemSizes ? itemScaleMap(itemSizes) : undefined,
  );

  const addItem = (itemId: number) => {
    if (!Number.isFinite(itemId)) {
      toast.error("Unknown filling item");
      return;
    }
    onPlacementsChange?.(addBolsterPiece(placements, itemId));
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
        aria-label="Mbolster x-ray filling view"
      >
        <defs>
          <clipPath id={`${uid}-capsule`}>
            <path d={capsule} />
          </clipPath>
          <clipPath id={`${uid}-capsule-inner`}>
            <path d={capsuleInner} />
          </clipPath>
        </defs>

        {/* x-ray art direction: shell interior darkens so fillings read inside */}
        <g clipPath={`url(#${uid}-capsule)`}>
          <path d={capsule} fill="rgba(15,23,42,0.5)" />
          <g clipPath={`url(#${uid}-capsule-inner)`}>
            {pieces.map((p) => {
              const subtype = itemSubtypes.get(p.itemId) ?? null;
              return (
                <MorphPiece
                  key={p.key}
                  subtype={subtype}
                  visual={fillingVisual(subtype)}
                  // non-uniform scale: the pouch squashes into its tract,
                  // pressing flat against its neighbors
                  transform={`translate(${p.x} ${p.y}) scale(${p.w / 100} ${p.h / 100})`}
                  conform={[{ d: capsuleInner }]}
                />
              );
            })}
          </g>
          {hovered && editable && <path d={capsule} fill="white" fillOpacity={0.15} />}
        </g>

        <path
          d={capsule}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: "auto" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      </svg>

      {/* Single compartment — pieces edit inline, no dive step */}
      {editable && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-2"
          style={{ pointerEvents: "auto" }}
          data-xray-bolster-editor
        >
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
