"use client";

// ponytail: a wrapper, not a fork — every editing behaviour stays in XrayPillow, so the three
// surfaces cannot drift.

import { useMemo, type ReactNode } from "react";

import { XrayBolster } from "./xray-bolster";
import { XrayPillow } from "./xray-pillow";
import { XRAY_VIEW } from "./xray-assets";
import { useItemMaps } from "./use-pillow-fit";
import { XRAY_THEME } from "./xray-theme";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { pillowDimensions, type PillowSize } from "@/lib/spatial-fillings/dimensions";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";
import type { BolsterFit, PillowFit } from "@/lib/spatial-fillings/fit";
import type { Section } from "@/lib/spatial-fillings/core";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { BolsterPlacement, PillowPlacement } from "@/lib/spatial-fillings/core";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";

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
  onDiveChange,
  controlsSlot,
  className,
}: {
  placements: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  items?: FillingItem[];
  pillowSize?: string | null;
  colorOverrides?: ColorOverrideRow[];
  dimensionOverrides?: DimensionOverridesPayload;
  fit?: PillowFit;
  onDiveChange?: (section: Section | null) => void;
  controlsSlot?: HTMLElement | null;
  className?: string;
}) {
  const { itemSubtypes, itemSizes, itemDims, loftAllowance } = useItemMaps(items, dimensionOverrides);
  const softBody = useMemo(() => softBodyFromPayload(dimensionOverrides), [dimensionOverrides]);
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
        onDiveChange={onDiveChange}
        items={items}
        onPlacementsChange={onPlacementsChange}
        controlsSlot={controlsSlot}
        softBody={softBody}
        className="absolute inset-0"
      />
    </XrayFrame>
  );
}

export function XrayBolsterEditor({
  placements,
  length,
  onPlacementsChange,
  items,
  colorOverrides = [],
  dimensionOverrides,
  fit,
  controlsSlot,
  className,
}: {
  placements: BolsterPlacement[];
  length: BolsterLength;
  onPlacementsChange?: (next: BolsterPlacement[]) => void;
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  dimensionOverrides?: DimensionOverridesPayload;
  fit?: BolsterFit;
  controlsSlot?: HTMLElement | null;
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
        fit={fit}
        items={items}
        onPlacementsChange={onPlacementsChange}
        controlsSlot={controlsSlot}
        className="absolute inset-0"
      />
    </XrayFrame>
  );
}
