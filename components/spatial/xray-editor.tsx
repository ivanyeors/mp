"use client";

/**
 * X-ray editor frame (CONTEXT.md): mounts XrayPillow (or XrayBolster) in normal document flow.
 *
 * XrayPillow renders its SVG at h-full/w-full inside a className-only root and
 * positions its dive overlay `absolute inset-0`, so it needs a positioned
 * ancestor with a definite height. The configurator gives it one by stretching
 * it over a full-bleed stage (`absolute inset-0`); an Admin Panel card does not.
 * This supplies that box at the x-ray's own aspect ratio so the same component
 * works inside a card without being modified.
 *
 * Colours come from Product Builder overrides as CSS variables on the container
 * (filling_color_overrides is service-role-only, so the Admin Panel receives the
 * rows from its server route). Absent variables fall back to the code default.
 * Dimensions (slice 02 / ADR 0019) come the same way: the dimension override
 * rows ride beside the colour rows and are folded over the code registry here.
 *
 * ponytail: a wrapper, not a fork — every editing behaviour stays in XrayPillow,
 * so the three surfaces cannot drift.
 */

import { useMemo, type ReactNode } from "react";

import { XrayBolster } from "./xray-bolster";
import { XrayPillow } from "./xray-pillow";
import { XRAY_VIEW } from "./xray-assets";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import {
  registryFromPayload,
  resolveItemDims,
  type DimensionOverridesPayload,
} from "@/lib/spatial-fillings/dimension-overrides";
import { pillowDimensions, type PillowSize } from "@/lib/spatial-fillings/dimensions";
import { fillingDescriptor } from "@/lib/spatial-fillings/filling-groups";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { BolsterPlacement, PillowPlacement } from "@/lib/spatial-fillings/core";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";

// The pouch colour, label size and drawn footprint come from each Item's type,
// size and registry dimensions, exactly as in the configurator — derived here
// so call sites pass one items array.
//
// Memoised on `items` (and the overrides), not rebuilt per render: the x-rays
// memoise their geometry chain (layout → conformPouchPath polygon scans) on
// [placements, stage, itemDims], so a fresh Map identity invalidates all of it.
// Both host pages keep text inputs in the same component as this editor, so
// every keystroke would otherwise re-conform every pouch (~7ms at 11 pieces,
// ~10ms at 17). mp-config memoises these maps for the same reason.
function useItemMaps(items: FillingItem[] | undefined, dimensionOverrides: DimensionOverridesPayload | undefined) {
  const itemSubtypes = useMemo(
    () => new Map((items ?? []).map((i) => [i.id, fillingDescriptor(i)])),
    [items],
  );
  const itemSizes = useMemo(() => new Map((items ?? []).map((i) => [i.id, i.size])), [items]);
  const registry = useMemo(() => registryFromPayload(dimensionOverrides), [dimensionOverrides]);
  const itemDims = useMemo(() => resolveItemDims(items ?? [], registry), [items, registry]);
  return { itemSubtypes, itemSizes, itemDims, loftAllowance: registry.loftAllowance };
}

// Light ground in light mode, dark in dark mode; the shell paint follows via
// the variables XrayPillow/XrayBolster read. Pieces keep their family colors.
const XRAY_THEME = [
  "border bg-slate-100 [--xray-shell:#64748b] [--xray-interior:rgba(255,255,255,0.75)] [--xray-veil:#f1f5f9]",
  "dark:border-transparent dark:bg-slate-950 dark:[--xray-shell:rgba(255,255,255,0.9)] dark:[--xray-interior:rgba(15,23,42,0.5)] dark:[--xray-veil:rgb(2,6,23)]",
].join(" ");

function XrayFrame({
  colorOverrides,
  className,
  children,
}: {
  colorOverrides: ColorOverrideRow[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // Phones: the dive picker blooms wider than the x-ray is tall (and the
      // dive dock sits under it), so the frame must not clip below md.
      className={`relative w-full overflow-hidden rounded-lg max-md:overflow-visible ${XRAY_THEME} ${className ?? ""}`}
      style={{ aspectRatio: `${XRAY_VIEW.width} / ${XRAY_VIEW.height}`, ...xrayColorVarStyle(colorOverrides) }}
    >
      {children}
    </div>
  );
}

export function XrayEditor({
  placements,
  onPlacementsChange,
  items,
  pillowSize,
  colorOverrides = [],
  dimensionOverrides,
  className,
}: {
  placements: PillowPlacement[];
  /** Omit together with `items` for a read-only render (no edit affordances). */
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  /** Inventory filling Items for the dive picker; omit for read-only. */
  items?: FillingItem[];
  /** The pillow Size the mix is drawn for; any case, unknown falls back to M. */
  pillowSize?: string | null;
  colorOverrides?: ColorOverrideRow[];
  /** Settings dimension overrides from the same server route as the colours. */
  dimensionOverrides?: DimensionOverridesPayload;
  className?: string;
}) {
  const { itemSubtypes, itemSizes, itemDims, loftAllowance } = useItemMaps(items, dimensionOverrides);
  const size: PillowSize = pillowDimensions(pillowSize).dims.size;
  return (
    <XrayFrame colorOverrides={colorOverrides} className={className}>
      <XrayPillow
        placements={placements}
        itemSubtypes={itemSubtypes}
        itemSizes={itemSizes}
        itemDims={itemDims}
        pillowSize={size}
        loftAllowance={loftAllowance}
        items={items}
        onPlacementsChange={onPlacementsChange}
        className="absolute inset-0"
      />
    </XrayFrame>
  );
}

/** Same frame for the Mbolster capsule x-ray the /mbolster-config staff assist edits on. */
export function XrayBolsterEditor({
  placements,
  length,
  onPlacementsChange,
  items,
  colorOverrides = [],
  dimensionOverrides,
  className,
}: {
  placements: BolsterPlacement[];
  length: BolsterLength;
  /** Omit together with `items` for a read-only render (no edit affordances). */
  onPlacementsChange?: (next: BolsterPlacement[]) => void;
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  dimensionOverrides?: DimensionOverridesPayload;
  className?: string;
}) {
  const { itemSubtypes, itemSizes, itemDims } = useItemMaps(items, dimensionOverrides);
  return (
    <XrayFrame colorOverrides={colorOverrides} className={className}>
      <XrayBolster
        placements={placements}
        length={length}
        itemSubtypes={itemSubtypes}
        itemSizes={itemSizes}
        itemDims={itemDims}
        items={items}
        onPlacementsChange={onPlacementsChange}
        className="absolute inset-0"
      />
    </XrayFrame>
  );
}
