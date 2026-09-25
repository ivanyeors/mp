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
 * The physical fit (slice 03/04): a host that shows the banner, the save
 * confirm or the cross-section computes it once with `usePillowFit`
 * (use-pillow-fit.ts) and hands the same object to this frame, so the x-ray,
 * the gauges and the cross-section can never disagree. A host that needs none
 * of those omits it and the x-ray computes its own.
 *
 * ponytail: a wrapper, not a fork — every editing behaviour stays in XrayPillow,
 * so the three surfaces cannot drift.
 */

import type { ReactNode } from "react";

import { XrayBolster } from "./xray-bolster";
import { XrayPillow } from "./xray-pillow";
import { XRAY_VIEW } from "./xray-assets";
import { useItemMaps } from "./use-pillow-fit";
import { XRAY_THEME } from "./xray-theme";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { pillowDimensions, type PillowSize } from "@/lib/spatial-fillings/dimensions";
import type { PillowFit } from "@/lib/spatial-fillings/fit";
import type { Cut } from "@/lib/spatial-fillings/cross-section";
import type { Section } from "@/lib/spatial-fillings/core";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { BolsterPlacement, PillowPlacement } from "@/lib/spatial-fillings/core";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";

// The pouch colour, label size and drawn footprint come from each Item's type,
// size and registry dimensions, exactly as in the configurator — derived in
// `useItemMaps` (use-pillow-fit.ts) so call sites pass one items array, and so
// a host can compute the same fit without loading this frame.

// Light ground in light mode, dark in dark mode (xray-theme.ts, shared with the
// cross-section); the shell paint follows via the variables XrayPillow reads.
// Pieces keep their family colors.

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
  fit,
  cutAt,
  onDiveChange,
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
  /** The host's fit (`usePillowFit`), shared with its banner and cross-section; computed by the x-ray when omitted. */
  fit?: PillowFit;
  /** Where the host's cross-section is taken (slice 05); the x-ray draws the cut line. */
  cutAt?: Cut;
  onDiveChange?: (section: Section | null) => void;
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
        fit={fit}
        cutAt={cutAt}
        onDiveChange={onDiveChange}
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
